#pragma once

#include "LocalIPC.hpp"

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <utility>
#include <vector>

struct FrameSnapshot final {
    std::shared_ptr<const std::vector<std::uint8_t>> commands;
    std::uint32_t sequence = 0;
    std::uint64_t revision = 0;
    std::uint64_t connectionGeneration = 0;
};

template <typename Resource>
struct PendingResourceUpload final {
    std::uint64_t connectionGeneration;
    Resource resource;
};

class GraphicsServer final {
public:
    explicit GraphicsServer(std::string socketPath);
    ~GraphicsServer();

    GraphicsServer(const GraphicsServer&) = delete;
    GraphicsServer& operator=(const GraphicsServer&) = delete;

    void start();
    void stop();

    void setDrawableSize(std::uint32_t width, std::uint32_t height);
    void sendPointerDown(float x, float y);
    void sendPointerMove(float x, float y);
    void sendPointerUp(float x, float y);
    void sendKeyDown(mgfx::ipc::Key key, std::uint16_t modifiers, bool repeat);
    void sendKeyUp(mgfx::ipc::Key key, std::uint16_t modifiers);
    void sendScroll(float x, float y, float deltaX, float deltaY);
    void sendTextInput(const std::string& text);
    void sendClose();
    void sendWindowChromeMetrics(float leadingInset, float titleBarHeight);
    void acknowledgeFramePresented(std::uint64_t connectionGeneration,
                                   std::uint32_t sequence);
    void serviceAnimationFrame(std::uint64_t monotonicNanoseconds);
    FrameSnapshot latestFrame() const;
    std::optional<std::string> takeWindowTitle();
    std::optional<mgfx::ipc::WindowConfig> takeWindowConfig();
    std::optional<mgfx::ipc::WindowState> takeWindowState();
    std::optional<mgfx::ipc::CursorShape> takeWindowCursor();
    std::optional<mgfx::ipc::WindowChrome> takeWindowChrome();
    std::optional<std::string> takeClipboardWrite();
    std::optional<std::pair<std::uint64_t, std::uint32_t>> takeClipboardRead();
    std::vector<PendingResourceUpload<mgfx::ipc::TextureUpload>> takeTextureUploads();
    std::vector<std::uint32_t> takeTextureDestroys();
    std::vector<PendingResourceUpload<mgfx::ipc::PathUpload>> takePathUploads();
    std::vector<std::uint32_t> takePathDestroys();
    std::vector<PendingResourceUpload<mgfx::ipc::MeshUpload>> takeMeshUploads();
    std::vector<std::uint32_t> takeMeshDestroys();
    void sendClipboardText(std::uint64_t connectionGeneration,
                           std::uint32_t sequence,
                           const std::string& text);
    void sendResourceStatus(std::uint64_t connectionGeneration,
                            mgfx::ipc::ResourceStatus status);
    bool takeClientDisconnected();

private:
    void run();
    void readConnection(const std::shared_ptr<mgfx::ipc::Connection>& active,
                        std::uint64_t generation);
    std::shared_ptr<mgfx::ipc::Connection> connection() const;

    std::string socketPath_;
    std::unique_ptr<mgfx::ipc::Listener> listener_;
    std::atomic<bool> stopping_{false};
    std::thread thread_;
    std::thread clientThread_;

    mutable std::mutex connectionMutex_;
    std::shared_ptr<mgfx::ipc::Connection> connection_;
    std::uint64_t connectionGeneration_ = 0;

    mutable std::mutex frameMutex_;
    std::shared_ptr<const std::vector<std::uint8_t>> latestFrame_;
    std::uint32_t latestFrameSequence_ = 0;
    std::uint64_t latestFrameRevision_ = 0;
    std::uint64_t latestFrameConnectionGeneration_ = 0;

    mutable std::mutex sizeMutex_;
    std::uint32_t width_ = 0;
    std::uint32_t height_ = 0;

    mutable std::mutex titleMutex_;
    std::optional<std::string> pendingTitle_;
    std::optional<mgfx::ipc::WindowConfig> pendingWindowConfig_;
    std::optional<mgfx::ipc::WindowState> pendingWindowState_;
    std::optional<mgfx::ipc::CursorShape> pendingWindowCursor_;
    std::optional<mgfx::ipc::WindowChrome> pendingWindowChrome_;
    std::atomic<bool> clientDisconnected_{false};

    mutable std::mutex animationMutex_;
    std::optional<std::pair<std::uint64_t, std::uint32_t>> pendingAnimationFrame_;

    mutable std::mutex clipboardMutex_;
    std::optional<std::string> pendingClipboardWrite_;
    std::optional<std::pair<std::uint64_t, std::uint32_t>> pendingClipboardRead_;

    mutable std::mutex resourceMutex_;
    std::vector<PendingResourceUpload<mgfx::ipc::TextureUpload>> pendingTextureUploads_;
    std::vector<std::uint32_t> pendingTextureDestroys_;
    std::vector<PendingResourceUpload<mgfx::ipc::PathUpload>> pendingPathUploads_;
    std::vector<std::uint32_t> pendingPathDestroys_;
    std::vector<PendingResourceUpload<mgfx::ipc::MeshUpload>> pendingMeshUploads_;
    std::vector<std::uint32_t> pendingMeshDestroys_;
};
