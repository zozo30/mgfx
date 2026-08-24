#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#import <MetalKit/MetalKit.h>

#include "GraphicsProtocol.hpp"
#include "GraphicsServer.hpp"
#include "LocalIPC.hpp"
#include "Renderer.hpp"

#include <algorithm>
#include <atomic>
#include <csignal>
#include <exception>
#include <chrono>
#include <memory>
#include <utility>

namespace {

volatile std::sig_atomic_t rendererRecoverySignal = 0;
std::atomic<bool> rendererErrorRecoveryRequested{false};

void requestRendererRecovery(int) { rendererRecoverySignal = 1; }

mgfx::ipc::Key semanticKey(NSEvent* event) {
    // Control keys must not depend on character production: repeat events and
    // active input methods are allowed to provide an empty character string.
    switch (event.keyCode) {
    case kVK_Delete: return mgfx::ipc::Key::backspace;
    case kVK_LeftArrow: return mgfx::ipc::Key::arrowLeft;
    case kVK_RightArrow: return mgfx::ipc::Key::arrowRight;
    case kVK_UpArrow: return mgfx::ipc::Key::arrowUp;
    case kVK_DownArrow: return mgfx::ipc::Key::arrowDown;
    case kVK_PageUp: return mgfx::ipc::Key::pageUp;
    case kVK_PageDown: return mgfx::ipc::Key::pageDown;
    case kVK_Home: return mgfx::ipc::Key::home;
    case kVK_End: return mgfx::ipc::Key::end;
    default: break;
    }
    NSString* characters = event.charactersIgnoringModifiers;
    if (characters.length == 0) return mgfx::ipc::Key::unknown;
    if ((event.modifierFlags & NSEventModifierFlagCommand) != 0) {
        switch ([characters characterAtIndex:0]) {
        case 'c': case 'C': return mgfx::ipc::Key::copy;
        case 'x': case 'X': return mgfx::ipc::Key::cut;
        case 'v': case 'V': return mgfx::ipc::Key::paste;
        case 'a': case 'A': return mgfx::ipc::Key::selectAll;
        default: break;
        }
    }
    switch ([characters characterAtIndex:0]) {
    case '\t': return mgfx::ipc::Key::tab;
    case '\r': case '\n': return mgfx::ipc::Key::enter;
    case ' ': return mgfx::ipc::Key::space;
    case 0x1b: return mgfx::ipc::Key::escape;
    case 0x08: case 0x7f: return mgfx::ipc::Key::backspace;
    case NSLeftArrowFunctionKey: return mgfx::ipc::Key::arrowLeft;
    case NSRightArrowFunctionKey: return mgfx::ipc::Key::arrowRight;
    case NSUpArrowFunctionKey: return mgfx::ipc::Key::arrowUp;
    case NSDownArrowFunctionKey: return mgfx::ipc::Key::arrowDown;
    case NSPageUpFunctionKey: return mgfx::ipc::Key::pageUp;
    case NSPageDownFunctionKey: return mgfx::ipc::Key::pageDown;
    case NSHomeFunctionKey: return mgfx::ipc::Key::home;
    case NSEndFunctionKey: return mgfx::ipc::Key::end;
    default: return mgfx::ipc::Key::unknown;
    }
}

std::uint16_t semanticModifiers(NSEvent* event) {
    const NSEventModifierFlags flags = event.modifierFlags;
    std::uint16_t result = 0;
    if ((flags & NSEventModifierFlagShift) != 0) result |= mgfx::ipc::KeyModifier::shift;
    if ((flags & NSEventModifierFlagControl) != 0) result |= mgfx::ipc::KeyModifier::control;
    if ((flags & NSEventModifierFlagOption) != 0) result |= mgfx::ipc::KeyModifier::alt;
    if ((flags & NSEventModifierFlagCommand) != 0) result |= mgfx::ipc::KeyModifier::command;
    return result;
}

NSCursor* nativeCursor(mgfx::ipc::CursorShape cursor) {
    switch (cursor) {
    case mgfx::ipc::CursorShape::pointingHand: return NSCursor.pointingHandCursor;
    case mgfx::ipc::CursorShape::text: return NSCursor.IBeamCursor;
    case mgfx::ipc::CursorShape::crosshair: return NSCursor.crosshairCursor;
    case mgfx::ipc::CursorShape::resizeHorizontal: return NSCursor.resizeLeftRightCursor;
    case mgfx::ipc::CursorShape::resizeVertical: return NSCursor.resizeUpDownCursor;
    case mgfx::ipc::CursorShape::arrow: return NSCursor.arrowCursor;
    }
    return NSCursor.arrowCursor;
}

mgfx::ipc::ResourceTrace resourceTrace(mgfx::ipc::ResourceKind kind,
                                       mgfx::ipc::ResourceAction action,
                                       std::uint32_t id,
                                       gfx::ResourceUsage usage) {
    return {kind, action, id, static_cast<std::uint32_t>(usage.resources),
            static_cast<std::uint32_t>(usage.maximumResources), usage.cost,
            usage.maximumCost};
}

} // namespace

@class AppDelegate;

@interface InteractiveMetalView : MTKView
@property(nonatomic, weak) AppDelegate* pointerDelegate;
@property(nonatomic, strong) NSCursor* activeCursor;
@end

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, MTKViewDelegate>
- (void)processServerCommands:(NSTimer*)timer;
- (void)recoverRenderer;
- (void)createWindowWithConfig:(mgfx::ipc::WindowConfig)config;
- (void)applyWindowState:(mgfx::ipc::WindowState)state;
- (void)sendWindowChromeMetrics;
- (void)metalView:(MTKView*)view pointerDownAt:(NSPoint)point;
- (BOOL)metalView:(MTKView*)view shouldBeginWindowDragAt:(NSPoint)point;
- (void)metalView:(MTKView*)view pointerMovedTo:(NSPoint)point;
- (void)metalView:(MTKView*)view pointerUpAt:(NSPoint)point;
- (void)metalView:(MTKView*)view keyDownEvent:(NSEvent*)event;
- (void)metalView:(MTKView*)view keyUpEvent:(NSEvent*)event;
- (void)metalView:(MTKView*)view scrollEvent:(NSEvent*)event;
@end

@implementation InteractiveMetalView

- (BOOL)acceptsFirstResponder { return YES; }

- (void)resetCursorRects {
    NSCursor* cursor = self.activeCursor != nil ? self.activeCursor : NSCursor.arrowCursor;
    [self addCursorRect:self.bounds cursor:cursor];
}

- (void)mouseDown:(NSEvent*)event {
    const NSPoint localPoint = [self convertPoint:event.locationInWindow fromView:nil];
    if ([self.pointerDelegate metalView:self shouldBeginWindowDragAt:localPoint]) {
        [self.window performWindowDragWithEvent:event];
        return;
    }
    [self.pointerDelegate metalView:self pointerDownAt:localPoint];
}

- (void)mouseMoved:(NSEvent*)event {
    [self.pointerDelegate metalView:self pointerMovedTo:[self convertPoint:event.locationInWindow fromView:nil]];
}

- (void)mouseDragged:(NSEvent*)event {
    [self mouseMoved:event];
}

- (void)mouseUp:(NSEvent*)event {
    [self.pointerDelegate metalView:self pointerUpAt:[self convertPoint:event.locationInWindow fromView:nil]];
}

- (void)keyDown:(NSEvent*)event {
    [self.pointerDelegate metalView:self keyDownEvent:event];
}

- (void)keyUp:(NSEvent*)event {
    [self.pointerDelegate metalView:self keyUpEvent:event];
}

- (void)scrollWheel:(NSEvent*)event {
    [self.pointerDelegate metalView:self scrollEvent:event];
}

@end

@implementation AppDelegate {
    id<MTLDevice> _device;
    NSUInteger _sampleCount;
    NSWindow* _window;
    InteractiveMetalView* _metalView;
    NSTimer* _controlTimer;
    NSString* _desiredTitle;
    mgfx::ipc::WindowState _desiredWindowState;
    bool _hasDesiredWindowState;
    bool _clientWindowVisible;
    CGFloat _draggableTitleHeightPixels;
    std::uint64_t _lastSubmittedFrameRevision;
    std::unique_ptr<Renderer> _renderer;
    std::unique_ptr<GraphicsServer> _graphicsServer;
}

- (void)applicationDidFinishLaunching:(NSNotification*)notification {
    (void)notification;

    _device = MTLCreateSystemDefaultDevice();
    if (_device == nil) {
        [NSApp presentError:[NSError errorWithDomain:@"MetalTriangle"
                                               code:1
                                           userInfo:@{NSLocalizedDescriptionKey: @"This Mac has no Metal device."}]];
        [NSApp terminate:nil];
        return;
    }

    try {
        _sampleCount = [_device supportsTextureSampleCount:4] ? 4 : 1;
        _renderer = std::make_unique<Renderer>((__bridge MTL::Device*)_device,
                                               static_cast<std::uint32_t>(_sampleCount));
        _graphicsServer = std::make_unique<GraphicsServer>(mgfx::ipc::defaultSocketPath());
        _graphicsServer->start();
        std::signal(SIGUSR1, requestRendererRecovery);
    } catch (const std::exception& exception) {
        NSString* message = [NSString stringWithUTF8String:exception.what()];
        [NSApp presentError:[NSError errorWithDomain:@"MetalTriangle"
                                               code:2
                                           userInfo:@{NSLocalizedDescriptionKey: message}]];
        [NSApp terminate:nil];
        return;
    }

    _desiredTitle = @"MGFX Client";
    _controlTimer = [NSTimer timerWithTimeInterval:1.0 / 60.0
                                            target:self
                                          selector:@selector(processServerCommands:)
                                          userInfo:nil
                                           repeats:YES];
    [[NSRunLoop mainRunLoop] addTimer:_controlTimer forMode:NSRunLoopCommonModes];
}

- (void)processServerCommands:(NSTimer*)timer {
    (void)timer;
    if (!_graphicsServer) return;

    if (rendererRecoverySignal != 0 ||
        rendererErrorRecoveryRequested.exchange(false, std::memory_order_relaxed)) {
        rendererRecoverySignal = 0;
        [self recoverRenderer];
    }

    if (_graphicsServer->takeClientDisconnected()) {
        _renderer->clearTextures();
        _renderer->clearPaths();
        _renderer->clearMeshes();
        if (_window != nil) {
            _clientWindowVisible = false;
            _metalView.paused = YES;
            [_window orderOut:nil];
            _graphicsServer->setDrawableSize(0, 0);
        }
        _desiredTitle = @"MGFX Client";
        _hasDesiredWindowState = false;
        _metalView.activeCursor = NSCursor.arrowCursor;
        [_window invalidateCursorRectsForView:_metalView];
        return;
    }

    for (PendingResourceUpload<mgfx::ipc::TextureUpload>& pending :
         _graphicsServer->takeTextureUploads()) {
        mgfx::ipc::TextureUpload& texture = pending.resource;
        try {
            _renderer->createTexture(texture.id, texture.width, texture.height, texture.rgba);
            _graphicsServer->sendResourceStatus(pending.connectionGeneration,
                {mgfx::ipc::ResourceKind::texture, mgfx::ipc::ResourceState::ready, texture.id});
            _graphicsServer->sendResourceTrace(pending.connectionGeneration,
                resourceTrace(mgfx::ipc::ResourceKind::texture,
                              mgfx::ipc::ResourceAction::created, texture.id,
                              _renderer->textureUsage()));
        } catch (const std::exception& error) {
            NSLog(@"MGFX texture %u rejected: %s", texture.id, error.what());
            _graphicsServer->sendResourceStatus(pending.connectionGeneration,
                {mgfx::ipc::ResourceKind::texture, mgfx::ipc::ResourceState::rejected, texture.id});
            _graphicsServer->sendResourceTrace(pending.connectionGeneration,
                resourceTrace(mgfx::ipc::ResourceKind::texture,
                              mgfx::ipc::ResourceAction::rejected, texture.id,
                              _renderer->textureUsage()));
        }
    }
    for (const PendingResourceDestroy pending : _graphicsServer->takeTextureDestroys()) {
        _renderer->destroyTexture(pending.id);
        _graphicsServer->sendResourceTrace(pending.connectionGeneration,
            resourceTrace(mgfx::ipc::ResourceKind::texture,
                          mgfx::ipc::ResourceAction::destroyed, pending.id,
                          _renderer->textureUsage()));
    }
    for (PendingResourceUpload<mgfx::ipc::PathUpload>& pending :
         _graphicsServer->takePathUploads()) {
        mgfx::ipc::PathUpload& path = pending.resource;
        try {
            _renderer->createPath(path.id, std::move(path.segments));
            _graphicsServer->sendResourceStatus(pending.connectionGeneration,
                {mgfx::ipc::ResourceKind::path, mgfx::ipc::ResourceState::ready, path.id});
            _graphicsServer->sendResourceTrace(pending.connectionGeneration,
                resourceTrace(mgfx::ipc::ResourceKind::path,
                              mgfx::ipc::ResourceAction::created, path.id,
                              _renderer->pathUsage()));
        } catch (const std::exception& error) {
            NSLog(@"MGFX path %u rejected: %s", path.id, error.what());
            _graphicsServer->sendResourceStatus(pending.connectionGeneration,
                {mgfx::ipc::ResourceKind::path, mgfx::ipc::ResourceState::rejected, path.id});
            _graphicsServer->sendResourceTrace(pending.connectionGeneration,
                resourceTrace(mgfx::ipc::ResourceKind::path,
                              mgfx::ipc::ResourceAction::rejected, path.id,
                              _renderer->pathUsage()));
        }
    }
    for (const PendingResourceDestroy pending : _graphicsServer->takePathDestroys()) {
        _renderer->destroyPath(pending.id);
        _graphicsServer->sendResourceTrace(pending.connectionGeneration,
            resourceTrace(mgfx::ipc::ResourceKind::path,
                          mgfx::ipc::ResourceAction::destroyed, pending.id,
                          _renderer->pathUsage()));
    }
    for (PendingResourceUpload<mgfx::ipc::MeshUpload>& pending :
         _graphicsServer->takeMeshUploads()) {
        mgfx::ipc::MeshUpload& mesh = pending.resource;
        try {
            _renderer->createMesh(mesh.id, mesh.vertices, mesh.indices);
            _graphicsServer->sendResourceStatus(pending.connectionGeneration,
                {mgfx::ipc::ResourceKind::mesh, mgfx::ipc::ResourceState::ready, mesh.id});
            _graphicsServer->sendResourceTrace(pending.connectionGeneration,
                resourceTrace(mgfx::ipc::ResourceKind::mesh,
                              mgfx::ipc::ResourceAction::created, mesh.id,
                              _renderer->meshUsage()));
        } catch (const std::exception& error) {
            NSLog(@"MGFX mesh %u rejected: %s", mesh.id, error.what());
            _graphicsServer->sendResourceStatus(pending.connectionGeneration,
                {mgfx::ipc::ResourceKind::mesh, mgfx::ipc::ResourceState::rejected, mesh.id});
            _graphicsServer->sendResourceTrace(pending.connectionGeneration,
                resourceTrace(mgfx::ipc::ResourceKind::mesh,
                              mgfx::ipc::ResourceAction::rejected, mesh.id,
                              _renderer->meshUsage()));
        }
    }
    for (const PendingResourceDestroy pending : _graphicsServer->takeMeshDestroys()) {
        _renderer->destroyMesh(pending.id);
        _graphicsServer->sendResourceTrace(pending.connectionGeneration,
            resourceTrace(mgfx::ipc::ResourceKind::mesh,
                          mgfx::ipc::ResourceAction::destroyed, pending.id,
                          _renderer->meshUsage()));
    }

    if (const std::optional<std::string> title = _graphicsServer->takeWindowTitle()) {
        NSString* nativeTitle = [NSString stringWithUTF8String:title->c_str()];
        if (nativeTitle != nil) {
            _desiredTitle = nativeTitle;
            if (_window != nil) _window.title = nativeTitle;
        }
    }
    if (const std::optional<mgfx::ipc::WindowConfig> config = _graphicsServer->takeWindowConfig()) {
        if (_window == nil) {
            [self createWindowWithConfig:*config];
        } else {
            _window.contentMinSize = NSMakeSize(config->minimumWidth, config->minimumHeight);
            [_window setContentSize:NSMakeSize(config->width, config->height)];
            _metalView.paused = NO;
            _clientWindowVisible = true;
            [_window makeKeyAndOrderFront:nil];
            [_window makeFirstResponder:_metalView];
            _graphicsServer->setDrawableSize(
                static_cast<std::uint32_t>(_metalView.drawableSize.width),
                static_cast<std::uint32_t>(_metalView.drawableSize.height));
            [NSApp activateIgnoringOtherApps:YES];
        }
    }
    if (const std::optional<mgfx::ipc::WindowState> state = _graphicsServer->takeWindowState()) {
        _desiredWindowState = *state;
        _hasDesiredWindowState = true;
        if (_window != nil) [self applyWindowState:*state];
    }
    if (const std::optional<mgfx::ipc::CursorShape> cursor =
            _graphicsServer->takeWindowCursor()) {
        NSCursor* value = nativeCursor(*cursor);
        _metalView.activeCursor = value;
        [_window invalidateCursorRectsForView:_metalView];
        [value set];
    }
    if (const std::optional<mgfx::ipc::WindowChrome> chrome =
            _graphicsServer->takeWindowChrome()) {
        const bool overlay = chrome->mode == mgfx::ipc::WindowChromeMode::overlay;
        // Protocol UI coordinates are drawable pixels. Keep the requested value
        // in that coordinate space and convert at hit-test time so moving the
        // window between displays with different backing scales stays correct.
        _draggableTitleHeightPixels = overlay ? chrome->draggableHeight : 0;
        _window.titlebarAppearsTransparent = overlay;
        _window.titleVisibility = overlay ? NSWindowTitleHidden : NSWindowTitleVisible;
        NSWindowStyleMask mask = _window.styleMask;
        if (overlay) mask |= NSWindowStyleMaskFullSizeContentView;
        else mask &= ~NSWindowStyleMaskFullSizeContentView;
        _window.styleMask = mask;
        [self sendWindowChromeMetrics];
    }
    if (const std::optional<std::string> text = _graphicsServer->takeClipboardWrite()) {
        NSString* nativeText = [[NSString alloc] initWithBytes:text->data()
                                                       length:text->size()
                                                     encoding:NSUTF8StringEncoding];
        if (nativeText != nil) {
            NSPasteboard* pasteboard = NSPasteboard.generalPasteboard;
            [pasteboard clearContents];
            [pasteboard setString:nativeText forType:NSPasteboardTypeString];
        }
    }
    if (const auto request = _graphicsServer->takeClipboardRead()) {
        NSString* nativeText = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
        const char* utf8 = nativeText != nil ? nativeText.UTF8String : "";
        _graphicsServer->sendClipboardText(request->first, request->second,
                                           utf8 != nullptr ? utf8 : "");
    }
}

- (void)recoverRenderer {
    if (!_renderer || _device == nil) return;
    id<MTLDevice> recoveredDevice = MTLCreateSystemDefaultDevice();
    if (recoveredDevice == nil) {
        NSLog(@"MGFX renderer recovery deferred: no Metal device is available");
        return;
    }
    const NSUInteger recoveredSampleCount =
        [recoveredDevice supportsTextureSampleCount:4] ? 4 : 1;
    try {
        std::unique_ptr<Renderer> recovered = _renderer->recreated(
            (__bridge MTL::Device*)recoveredDevice,
            static_cast<std::uint32_t>(recoveredSampleCount));
        const gfx::ResourceUsage textures = recovered->textureUsage();
        const gfx::ResourceUsage paths = recovered->pathUsage();
        const gfx::ResourceUsage meshes = recovered->meshUsage();
        _renderer = std::move(recovered);
        _device = recoveredDevice;
        _sampleCount = recoveredSampleCount;
        if (_metalView != nil) {
            const BOOL wasPaused = _metalView.paused;
            _metalView.paused = YES;
            _metalView.device = recoveredDevice;
            _metalView.sampleCount = recoveredSampleCount;
            _metalView.paused = wasPaused;
        }
        _lastSubmittedFrameRevision = 0;
        NSLog(@"MGFX renderer recovered: %zu textures, %zu paths, %zu meshes",
              textures.resources, paths.resources, meshes.resources);
    } catch (const std::exception& error) {
        NSLog(@"MGFX renderer recovery failed; retaining current renderer: %s", error.what());
    }
}

- (void)createWindowWithConfig:(mgfx::ipc::WindowConfig)config {
    const NSRect frame = NSMakeRect(0.0, 0.0, config.width, config.height);
    _metalView = [[InteractiveMetalView alloc] initWithFrame:frame device:_device];
    _metalView.colorPixelFormat = MTLPixelFormatBGRA8Unorm;
    _metalView.sampleCount = _sampleCount;
    _metalView.clearColor = MTLClearColorMake(0.025, 0.035, 0.055, 1.0);
    _metalView.preferredFramesPerSecond = 60;
    _metalView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _metalView.delegate = self;
    _metalView.pointerDelegate = self;
    _metalView.activeCursor = NSCursor.arrowCursor;

    const NSWindowStyleMask style = NSWindowStyleMaskTitled |
                                    NSWindowStyleMaskClosable |
                                    NSWindowStyleMaskMiniaturizable |
                                    NSWindowStyleMaskResizable;
    _window = [[NSWindow alloc] initWithContentRect:frame
                                          styleMask:style
                                            backing:NSBackingStoreBuffered
                                              defer:NO];
    _window.title = _desiredTitle;
    _window.releasedWhenClosed = NO;
    _window.contentMinSize = NSMakeSize(config.minimumWidth, config.minimumHeight);
    _window.contentView = _metalView;
    _window.delegate = self;
    _window.acceptsMouseMovedEvents = YES;
    [_window center];
    [_window makeKeyAndOrderFront:nil];
    [_window makeFirstResponder:_metalView];
    _clientWindowVisible = true;

    _graphicsServer->setDrawableSize(static_cast<std::uint32_t>(_metalView.drawableSize.width),
                                     static_cast<std::uint32_t>(_metalView.drawableSize.height));
    [self sendWindowChromeMetrics];
    if (_hasDesiredWindowState) [self applyWindowState:_desiredWindowState];
    [NSApp activateIgnoringOtherApps:YES];
}

- (void)sendWindowChromeMetrics {
    if (_window == nil || _metalView == nil || _metalView.bounds.size.width <= 0.0) return;
    CGFloat controlsMaxX = 0.0;
    const NSWindowButton buttons[] = {
        NSWindowCloseButton, NSWindowMiniaturizeButton, NSWindowZoomButton,
    };
    for (const NSWindowButton type : buttons) {
        NSButton* button = [_window standardWindowButton:type];
        if (button == nil) continue;
        const NSRect inMetalView = [_metalView convertRect:button.bounds fromView:button];
        controlsMaxX = std::max(controlsMaxX, NSMaxX(inMetalView));
    }
    const CGFloat drawableScale = _metalView.drawableSize.width / _metalView.bounds.size.width;
    const NSRect nativeContent = [_window contentRectForFrameRect:_window.frame];
    const CGFloat titleBarHeight = std::max<CGFloat>(0.0,
        NSHeight(_window.frame) - NSHeight(nativeContent));
    _graphicsServer->sendWindowChromeMetrics(
        static_cast<float>((controlsMaxX + 10.0) * drawableScale),
        static_cast<float>(titleBarHeight * drawableScale));
}

- (void)applyWindowState:(mgfx::ipc::WindowState)state {
    NSWindowStyleMask mask = _window.styleMask;
    if (state.resizable) mask |= NSWindowStyleMaskResizable;
    else mask &= ~NSWindowStyleMaskResizable;
    _window.styleMask = mask;

    const bool fullscreen = (_window.styleMask & NSWindowStyleMaskFullScreen) != 0;
    if (state.mode == mgfx::ipc::WindowMode::fullscreen) {
        if (!fullscreen) [_window toggleFullScreen:nil];
    } else if (fullscreen) {
        [_window toggleFullScreen:nil];
    } else {
        const bool shouldZoom = state.mode == mgfx::ipc::WindowMode::maximized;
        if (_window.isZoomed != shouldZoom) [_window zoom:nil];
    }
}

- (void)drawInMTKView:(MTKView*)view {
    const auto now = std::chrono::steady_clock::now().time_since_epoch();
    _graphicsServer->serviceAnimationFrame(static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(now).count()));
    const FrameSnapshot frame = _graphicsServer->latestFrame();
    std::vector<std::uint8_t> fallbackCommands;
    if (!frame.commands || frame.commands->empty()) {
        gfx::CommandEncoder commands;
        commands.clear({0.025F, 0.035F, 0.055F, 1.0F});
        commands.endFrame();
        fallbackCommands = commands.finish();
    }
    const std::vector<std::uint8_t>& frameCommands = frame.commands && !frame.commands->empty()
        ? *frame.commands
        : fallbackCommands;

    MTL::CommandBuffer* commandBuffer = _renderer->encode(
        frameCommands,
        (__bridge MTL::RenderPassDescriptor*)view.currentRenderPassDescriptor,
        (__bridge CA::MetalDrawable*)view.currentDrawable);
    if (commandBuffer == nullptr) return;

    const bool acknowledge = frame.commands && !frame.commands->empty() &&
        frame.revision != _lastSubmittedFrameRevision;
    const std::uint64_t generation = frame.connectionGeneration;
    const std::uint32_t sequence = frame.sequence;
    if (acknowledge) {
        _lastSubmittedFrameRevision = frame.revision;
    }
    GraphicsServer* server = _graphicsServer.get();
    id<MTLCommandBuffer> nativeCommandBuffer = (__bridge id<MTLCommandBuffer>)commandBuffer;
    [nativeCommandBuffer addCompletedHandler:^(id<MTLCommandBuffer> completed) {
        if (completed.status == MTLCommandBufferStatusError) {
            NSLog(@"MGFX Metal command buffer failed: %@", completed.error);
            rendererErrorRecoveryRequested.store(true, std::memory_order_relaxed);
        } else if (acknowledge) {
            server->acknowledgeFramePresented(generation, sequence);
        }
    }];
    commandBuffer->commit();
}

- (void)windowWillClose:(NSNotification*)notification {
    if (notification.object != _window) return;
    if (_graphicsServer) {
        if (_clientWindowVisible) _graphicsServer->sendClose();
        _graphicsServer->setDrawableSize(0, 0);
    }
    _clientWindowVisible = false;
    _metalView.paused = YES;
}

- (void)mtkView:(MTKView*)view drawableSizeWillChange:(CGSize)size {
    (void)view;
    _graphicsServer->setDrawableSize(static_cast<std::uint32_t>(size.width),
                                     static_cast<std::uint32_t>(size.height));
    [self sendWindowChromeMetrics];
}

- (void)metalView:(MTKView*)view pointerDownAt:(NSPoint)point {
    if (view.bounds.size.width <= 0.0 || view.bounds.size.height <= 0.0) {
        return;
    }
    const float scaleX = static_cast<float>(view.drawableSize.width / view.bounds.size.width);
    const float scaleY = static_cast<float>(view.drawableSize.height / view.bounds.size.height);
    _graphicsServer->sendPointerDown(static_cast<float>(point.x) * scaleX,
                                     static_cast<float>(view.bounds.size.height - point.y) * scaleY);
}

- (BOOL)metalView:(MTKView*)view shouldBeginWindowDragAt:(NSPoint)point {
    if (_draggableTitleHeightPixels <= 0.0 || view.bounds.size.height <= 0.0) {
        return NO;
    }
    const CGFloat scaleY = view.drawableSize.height / view.bounds.size.height;
    if (scaleY <= 0.0) return NO;
    const CGFloat draggableHeightPoints = _draggableTitleHeightPixels / scaleY;
    return point.y >= view.bounds.size.height - draggableHeightPoints;
}

- (void)metalView:(MTKView*)view pointerMovedTo:(NSPoint)point {
    if (view.bounds.size.width <= 0.0 || view.bounds.size.height <= 0.0) return;
    const float scaleX = static_cast<float>(view.drawableSize.width / view.bounds.size.width);
    const float scaleY = static_cast<float>(view.drawableSize.height / view.bounds.size.height);
    _graphicsServer->sendPointerMove(static_cast<float>(point.x) * scaleX,
                                    static_cast<float>(view.bounds.size.height - point.y) * scaleY);
}

- (void)metalView:(MTKView*)view pointerUpAt:(NSPoint)point {
    if (view.bounds.size.width <= 0.0 || view.bounds.size.height <= 0.0) return;
    const float scaleX = static_cast<float>(view.drawableSize.width / view.bounds.size.width);
    const float scaleY = static_cast<float>(view.drawableSize.height / view.bounds.size.height);
    _graphicsServer->sendPointerUp(static_cast<float>(point.x) * scaleX,
                                  static_cast<float>(view.bounds.size.height - point.y) * scaleY);
}

- (void)metalView:(MTKView*)view keyDownEvent:(NSEvent*)event {
    (void)view;
    const mgfx::ipc::Key key = semanticKey(event);
    if (key != mgfx::ipc::Key::unknown) {
        _graphicsServer->sendKeyDown(key, semanticModifiers(event), event.isARepeat);
    }
    NSString* characters = event.characters;
    const NSEventModifierFlags flags = event.modifierFlags;
    if (characters.length > 0 && (flags & (NSEventModifierFlagCommand |
                                           NSEventModifierFlagControl)) == 0) {
        const unichar first = [characters characterAtIndex:0];
        const bool printable = first >= 0x20 && !(first >= 0xF700 && first <= 0xF8FF);
        if (printable) {
            _graphicsServer->sendTextInput(characters.UTF8String);
        }
    }
}

- (void)metalView:(MTKView*)view keyUpEvent:(NSEvent*)event {
    (void)view;
    const mgfx::ipc::Key key = semanticKey(event);
    if (key != mgfx::ipc::Key::unknown) {
        _graphicsServer->sendKeyUp(key, semanticModifiers(event));
    }
}

- (void)metalView:(MTKView*)view scrollEvent:(NSEvent*)event {
    if (view.bounds.size.width <= 0.0 || view.bounds.size.height <= 0.0) return;
    const NSPoint point = [view convertPoint:event.locationInWindow fromView:nil];
    const float scaleX = static_cast<float>(view.drawableSize.width / view.bounds.size.width);
    const float scaleY = static_cast<float>(view.drawableSize.height / view.bounds.size.height);
    _graphicsServer->sendScroll(static_cast<float>(point.x) * scaleX,
                                static_cast<float>(view.bounds.size.height - point.y) * scaleY,
                                static_cast<float>(-event.scrollingDeltaX) * scaleX,
                                static_cast<float>(-event.scrollingDeltaY) * scaleY);
}

- (void)applicationWillTerminate:(NSNotification*)notification {
    (void)notification;
    [_controlTimer invalidate];
    _controlTimer = nil;
    if (_graphicsServer) {
        _graphicsServer->sendClose();
        _graphicsServer->stop();
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication*)sender {
    (void)sender;
    return NO;
}

@end

int main() {
    @autoreleasepool {
        NSApplication* application = [NSApplication sharedApplication];
        application.activationPolicy = NSApplicationActivationPolicyRegular;

        AppDelegate* delegate = [[AppDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
