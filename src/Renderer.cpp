#include "Renderer.hpp"

#include <algorithm>
#include <cstddef>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iterator>
#include <array>
#include <stdexcept>
#include <string>

namespace {

std::string errorMessage(const char* prefix, NS::Error* error) {
    if (error == nullptr || error->localizedDescription() == nullptr) {
        return prefix;
    }
    return std::string(prefix) + ": " + error->localizedDescription()->utf8String();
}

gfx::AffineTransform concatenate(const gfx::AffineTransform& parent,
                                 const gfx::AffineTransform& child) {
    return {
        parent.m11 * child.m11 + parent.m21 * child.m12,
        parent.m12 * child.m11 + parent.m22 * child.m12,
        parent.m11 * child.m21 + parent.m21 * child.m22,
        parent.m12 * child.m21 + parent.m22 * child.m22,
        parent.m11 * child.translateX + parent.m21 * child.translateY + parent.translateX,
        parent.m12 * child.translateX + parent.m22 * child.translateY + parent.translateY,
    };
}

std::array<float, 2> transformPoint(const gfx::AffineTransform& transform,
                                    std::array<float, 2> point) {
    return {transform.m11 * point[0] + transform.m21 * point[1] + transform.translateX,
            transform.m12 * point[0] + transform.m22 * point[1] + transform.translateY};
}

bool finiteTransform(const gfx::AffineTransform& transform) {
    return std::isfinite(transform.m11) && std::isfinite(transform.m12) &&
           std::isfinite(transform.m21) && std::isfinite(transform.m22) &&
           std::isfinite(transform.translateX) && std::isfinite(transform.translateY);
}

} // namespace

Renderer::Renderer(MTL::Device* device, std::uint32_t sampleCount)
    : device_(NS::RetainPtr(device)),
      commandQueue_(NS::TransferPtr(device->newCommandQueue())) {
    if (!device_) {
        throw std::runtime_error("No Metal device is available");
    }
    if (!commandQueue_) {
        throw std::runtime_error("Could not create a Metal command queue");
    }

    NS::Error* error = nullptr;
#if MGFX_PRECOMPILED_SHADERS
    NS::String* resourcePath = NS::Bundle::mainBundle()
                                   ->resourcePath()
                                   ->stringByAppendingString(MTLSTR("/default.metallib"));
    auto library = NS::TransferPtr(device_->newLibrary(resourcePath, &error));
#else
    NS::String* resourcePath = NS::Bundle::mainBundle()
                                   ->resourcePath()
                                   ->stringByAppendingString(MTLSTR("/Triangle.metal"));
    std::ifstream sourceFile(resourcePath->utf8String());
    const std::string shaderSource((std::istreambuf_iterator<char>(sourceFile)),
                                   std::istreambuf_iterator<char>());
    NS::String* source = NS::String::string(shaderSource.c_str(), NS::UTF8StringEncoding);
    auto library = NS::TransferPtr(device_->newLibrary(source, nullptr, &error));
#endif
    if (!library) {
        throw std::runtime_error(errorMessage("Could not load Metal shaders", error));
    }

    auto vertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("vertexMain")));
    auto fragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("fragmentMain")));
    auto radialPathVertexFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("radialPathVertexMain")));
    auto radialPathFragmentFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("radialPathFragmentMain")));
    auto imageVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("imageVertexMain")));
    auto imageFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("imageFragmentMain")));
    auto imageSurfaceVertexFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("imageSurfaceVertexMain")));
    auto imageSurfaceFragmentFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("imageSurfaceFragmentMain")));
    auto shadowVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("shadowVertexMain")));
    auto shadowFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("shadowFragmentMain")));
    auto radialVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("radialVertexMain")));
    auto radialFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("radialFragmentMain")));
    auto roundedRectVertexFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("roundedRectVertexMain")));
    auto roundedRectFragmentFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("roundedRectFragmentMain")));
    auto circleVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("circleVertexMain")));
    auto circleFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("circleFragmentMain")));
    auto patternVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("patternVertexMain")));
    auto patternFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("patternFragmentMain")));
    auto gridPatternVertexFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("gridPatternVertexMain")));
    auto gridPatternFragmentFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("gridPatternFragmentMain")));
    auto linearGradientVertexFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("linearGradientVertexMain")));
    auto linearGradientFragmentFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("linearGradientFragmentMain")));
    auto linearGradientCircleFragmentFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("linearGradientCircleFragmentMain")));
    auto dotGridVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("dotGridVertexMain")));
    auto dotGridFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("dotGridFragmentMain")));
    auto waveDotsVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("waveDotsVertexMain")));
    auto waveDotsFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("waveDotsFragmentMain")));
    auto conicGradientVertexFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("conicGradientVertexMain")));
    auto conicGradientFragmentFunction = NS::TransferPtr(
        library->newFunction(MTLSTR("conicGradientFragmentMain")));
    if (!vertexFunction || !fragmentFunction || !radialPathVertexFunction ||
        !radialPathFragmentFunction || !imageVertexFunction || !imageFragmentFunction ||
        !imageSurfaceVertexFunction || !imageSurfaceFragmentFunction ||
        !shadowVertexFunction || !shadowFragmentFunction ||
        !radialVertexFunction || !radialFragmentFunction ||
        !roundedRectVertexFunction || !roundedRectFragmentFunction ||
        !circleVertexFunction || !circleFragmentFunction ||
        !patternVertexFunction || !patternFragmentFunction ||
        !gridPatternVertexFunction || !gridPatternFragmentFunction ||
        !linearGradientVertexFunction || !linearGradientFragmentFunction ||
        !linearGradientCircleFragmentFunction ||
        !dotGridVertexFunction || !dotGridFragmentFunction ||
        !waveDotsVertexFunction || !waveDotsFragmentFunction ||
        !conicGradientVertexFunction || !conicGradientFragmentFunction) {
        throw std::runtime_error("Could not find the triangle shader functions");
    }

    auto descriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    descriptor->setVertexFunction(vertexFunction.get());
    descriptor->setFragmentFunction(fragmentFunction.get());
    descriptor->setRasterSampleCount(sampleCount);
    auto* color = descriptor->colorAttachments()->object(0);
    color->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    color->setBlendingEnabled(true);
    color->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    color->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    color->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    color->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);

    pipelineState_ = NS::TransferPtr(device_->newRenderPipelineState(descriptor.get(), &error));
    if (!pipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the render pipeline", error));
    }

    auto radialPathDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    radialPathDescriptor->setVertexFunction(radialPathVertexFunction.get());
    radialPathDescriptor->setFragmentFunction(radialPathFragmentFunction.get());
    radialPathDescriptor->setRasterSampleCount(sampleCount);
    auto* radialPathColor = radialPathDescriptor->colorAttachments()->object(0);
    radialPathColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    radialPathColor->setBlendingEnabled(true);
    radialPathColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    radialPathColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    radialPathColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    radialPathColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    radialPathPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(radialPathDescriptor.get(), &error));
    if (!radialPathPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create radial path pipeline", error));
    }

    auto imageDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    imageDescriptor->setVertexFunction(imageVertexFunction.get());
    imageDescriptor->setFragmentFunction(imageFragmentFunction.get());
    imageDescriptor->setRasterSampleCount(sampleCount);
    imageDescriptor->colorAttachments()->object(0)->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    auto* imageColor = imageDescriptor->colorAttachments()->object(0);
    imageColor->setBlendingEnabled(true);
    imageColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    imageColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    imageColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    imageColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    imagePipelineState_ = NS::TransferPtr(device_->newRenderPipelineState(imageDescriptor.get(), &error));
    if (!imagePipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the image render pipeline", error));
    }

    auto imageSurfaceDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    imageSurfaceDescriptor->setVertexFunction(imageSurfaceVertexFunction.get());
    imageSurfaceDescriptor->setFragmentFunction(imageSurfaceFragmentFunction.get());
    imageSurfaceDescriptor->setRasterSampleCount(sampleCount);
    auto* imageSurfaceColor = imageSurfaceDescriptor->colorAttachments()->object(0);
    imageSurfaceColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    imageSurfaceColor->setBlendingEnabled(true);
    imageSurfaceColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    imageSurfaceColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    imageSurfaceColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    imageSurfaceColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    imageSurfacePipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(imageSurfaceDescriptor.get(), &error));
    if (!imageSurfacePipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the image-surface pipeline", error));
    }

    auto shadowDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    shadowDescriptor->setVertexFunction(shadowVertexFunction.get());
    shadowDescriptor->setFragmentFunction(shadowFragmentFunction.get());
    shadowDescriptor->setRasterSampleCount(sampleCount);
    auto* shadowColor = shadowDescriptor->colorAttachments()->object(0);
    shadowColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    shadowColor->setBlendingEnabled(true);
    shadowColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    shadowColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    shadowColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    shadowColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    shadowPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(shadowDescriptor.get(), &error));
    if (!shadowPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the shadow render pipeline", error));
    }

    auto radialDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    radialDescriptor->setVertexFunction(radialVertexFunction.get());
    radialDescriptor->setFragmentFunction(radialFragmentFunction.get());
    radialDescriptor->setRasterSampleCount(sampleCount);
    auto* radialColor = radialDescriptor->colorAttachments()->object(0);
    radialColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    radialColor->setBlendingEnabled(true);
    radialColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    radialColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    radialColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    radialColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    radialPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(radialDescriptor.get(), &error));
    if (!radialPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the radial-gradient pipeline", error));
    }

    auto roundedDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    roundedDescriptor->setVertexFunction(roundedRectVertexFunction.get());
    roundedDescriptor->setFragmentFunction(roundedRectFragmentFunction.get());
    roundedDescriptor->setRasterSampleCount(sampleCount);
    auto* roundedColor = roundedDescriptor->colorAttachments()->object(0);
    roundedColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    roundedColor->setBlendingEnabled(true);
    roundedColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    roundedColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    roundedColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    roundedColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    roundedRectPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(roundedDescriptor.get(), &error));
    if (!roundedRectPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the rounded-rectangle pipeline", error));
    }

    auto circleDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    circleDescriptor->setVertexFunction(circleVertexFunction.get());
    circleDescriptor->setFragmentFunction(circleFragmentFunction.get());
    circleDescriptor->setRasterSampleCount(sampleCount);
    auto* circleColor = circleDescriptor->colorAttachments()->object(0);
    circleColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    circleColor->setBlendingEnabled(true);
    circleColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    circleColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    circleColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    circleColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    circlePipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(circleDescriptor.get(), &error));
    if (!circlePipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the circle pipeline", error));
    }

    auto patternDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    patternDescriptor->setVertexFunction(patternVertexFunction.get());
    patternDescriptor->setFragmentFunction(patternFragmentFunction.get());
    patternDescriptor->setRasterSampleCount(sampleCount);
    auto* patternColor = patternDescriptor->colorAttachments()->object(0);
    patternColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    patternColor->setBlendingEnabled(true);
    patternColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    patternColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    patternColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    patternColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    patternPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(patternDescriptor.get(), &error));
    if (!patternPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the diagonal-pattern pipeline", error));
    }

    auto gridPatternDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    gridPatternDescriptor->setVertexFunction(gridPatternVertexFunction.get());
    gridPatternDescriptor->setFragmentFunction(gridPatternFragmentFunction.get());
    gridPatternDescriptor->setRasterSampleCount(sampleCount);
    auto* gridPatternColor = gridPatternDescriptor->colorAttachments()->object(0);
    gridPatternColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    gridPatternColor->setBlendingEnabled(true);
    gridPatternColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    gridPatternColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    gridPatternColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    gridPatternColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    gridPatternPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(gridPatternDescriptor.get(), &error));
    if (!gridPatternPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the grid-pattern pipeline", error));
    }

    auto linearGradientDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    linearGradientDescriptor->setVertexFunction(linearGradientVertexFunction.get());
    linearGradientDescriptor->setFragmentFunction(linearGradientFragmentFunction.get());
    linearGradientDescriptor->setRasterSampleCount(sampleCount);
    auto* linearGradientColor = linearGradientDescriptor->colorAttachments()->object(0);
    linearGradientColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    linearGradientColor->setBlendingEnabled(true);
    linearGradientColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    linearGradientColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    linearGradientColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    linearGradientColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    linearGradientPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(linearGradientDescriptor.get(), &error));
    if (!linearGradientPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the linear-gradient pipeline", error));
    }
    linearGradientDescriptor->setFragmentFunction(linearGradientCircleFragmentFunction.get());
    linearGradientCirclePipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(linearGradientDescriptor.get(), &error));
    if (!linearGradientCirclePipelineState_) {
        throw std::runtime_error(errorMessage(
            "Could not create the linear-gradient circle pipeline", error));
    }

    auto dotGridDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    dotGridDescriptor->setVertexFunction(dotGridVertexFunction.get());
    dotGridDescriptor->setFragmentFunction(dotGridFragmentFunction.get());
    dotGridDescriptor->setRasterSampleCount(sampleCount);
    auto* dotGridColor = dotGridDescriptor->colorAttachments()->object(0);
    dotGridColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    dotGridColor->setBlendingEnabled(true);
    dotGridColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    dotGridColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    dotGridColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    dotGridColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    dotGridPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(dotGridDescriptor.get(), &error));
    if (!dotGridPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the dot-grid pipeline", error));
    }

    auto waveDotsDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    waveDotsDescriptor->setVertexFunction(waveDotsVertexFunction.get());
    waveDotsDescriptor->setFragmentFunction(waveDotsFragmentFunction.get());
    waveDotsDescriptor->setRasterSampleCount(sampleCount);
    auto* waveDotsColor = waveDotsDescriptor->colorAttachments()->object(0);
    waveDotsColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    waveDotsColor->setBlendingEnabled(true);
    waveDotsColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    waveDotsColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    waveDotsColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    waveDotsColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    waveDotsPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(waveDotsDescriptor.get(), &error));
    if (!waveDotsPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the wave-dots pipeline", error));
    }

    auto conicDescriptor = NS::TransferPtr(MTL::RenderPipelineDescriptor::alloc()->init());
    conicDescriptor->setVertexFunction(conicGradientVertexFunction.get());
    conicDescriptor->setFragmentFunction(conicGradientFragmentFunction.get());
    conicDescriptor->setRasterSampleCount(sampleCount);
    auto* conicColor = conicDescriptor->colorAttachments()->object(0);
    conicColor->setPixelFormat(MTL::PixelFormatBGRA8Unorm);
    conicColor->setBlendingEnabled(true);
    conicColor->setSourceRGBBlendFactor(MTL::BlendFactorOne);
    conicColor->setDestinationRGBBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    conicColor->setSourceAlphaBlendFactor(MTL::BlendFactorOne);
    conicColor->setDestinationAlphaBlendFactor(MTL::BlendFactorOneMinusSourceAlpha);
    conicGradientPipelineState_ = NS::TransferPtr(
        device_->newRenderPipelineState(conicDescriptor.get(), &error));
    if (!conicGradientPipelineState_) {
        throw std::runtime_error(errorMessage("Could not create the conic-gradient pipeline", error));
    }
}

void Renderer::createTexture(std::uint32_t id, std::uint32_t width, std::uint32_t height,
                             const std::vector<std::uint8_t>& rgba) {
    if (id == 0 || rgba.size() != static_cast<std::size_t>(width) * height * 4) return;
    auto descriptor = NS::TransferPtr(MTL::TextureDescriptor::alloc()->init());
    descriptor->setTextureType(MTL::TextureType2D);
    descriptor->setPixelFormat(MTL::PixelFormatRGBA8Unorm_sRGB);
    descriptor->setWidth(width);
    descriptor->setHeight(height);
    descriptor->setUsage(MTL::TextureUsageShaderRead);
    auto texture = NS::TransferPtr(device_->newTexture(descriptor.get()));
    if (!texture) throw std::runtime_error("Could not allocate an image texture");
    texture->replaceRegion(MTL::Region::Make2D(0, 0, width, height), 0,
                           rgba.data(), static_cast<NS::UInteger>(width) * 4);
    textures_[id] = std::move(texture);
}

void Renderer::destroyTexture(std::uint32_t id) { textures_.erase(id); }
void Renderer::clearTextures() { textures_.clear(); }

void Renderer::createPath(std::uint32_t id, std::vector<mgfx::ipc::PathSegment> segments) {
    if (id == 0 || segments.empty()) return;
    paths_[id] = {std::move(segments), {}};
}

void Renderer::destroyPath(std::uint32_t id) { paths_.erase(id); }
void Renderer::clearPaths() { paths_.clear(); }

void Renderer::createMesh(std::uint32_t id, const std::vector<mgfx::ipc::MeshVertex>& vertices,
                          const std::vector<std::uint32_t>& indices) {
    if (id == 0 || vertices.empty() || indices.empty() || indices.size() % 3 != 0) return;
    std::vector<gfx::Vertex> triangles;
    triangles.reserve(indices.size());
    for (const std::uint32_t index : indices) {
        if (index >= vertices.size()) return;
        const auto& source = vertices[index];
        triangles.push_back({source.position, source.color});
    }
    meshes_[id] = std::move(triangles);
}

void Renderer::destroyMesh(std::uint32_t id) { meshes_.erase(id); }
void Renderer::clearMeshes() { meshes_.clear(); }

MTL::CommandBuffer* Renderer::encode(const std::vector<std::uint8_t>& commandStream,
                                     MTL::RenderPassDescriptor* renderPass,
                                     CA::MetalDrawable* drawable) {
    if (renderPass == nullptr || drawable == nullptr) {
        return nullptr;
    }

    gfx::CommandDecoder decoder(commandStream);
    if (!decoder.valid()) {
        throw std::runtime_error(decoder.error());
    }

    MTL::CommandBuffer* commandBuffer = commandQueue_->commandBuffer();
    MTL::RenderCommandEncoder* encoder = nullptr;
    std::vector<gfx::ClipRect> clipStack;
    std::vector<gfx::AffineTransform> transformStack{{1.0F, 0.0F, 0.0F, 1.0F, 0.0F, 0.0F}};
    std::vector<float> opacityStack{1.0F};
    const auto currentTransform = [&]() -> const gfx::AffineTransform& {
        return transformStack.back();
    };
    const auto currentClip = [&]() {
        return clipStack.empty() ? gfx::ClipRect{0.0F, 0.0F, 1.0F, 1.0F} : clipStack.back();
    };
    const auto clipEmpty = [&]() {
        const gfx::ClipRect clip = currentClip();
        return clip.right <= clip.left || clip.bottom <= clip.top;
    };
    const auto applyClip = [&]() {
        if (encoder == nullptr || clipEmpty()) return;
        const gfx::ClipRect clip = currentClip();
        const double width = static_cast<double>(drawable->texture()->width());
        const double height = static_cast<double>(drawable->texture()->height());
        const auto left = static_cast<NS::UInteger>(std::floor(std::clamp(clip.left, 0.0F, 1.0F) * width));
        const auto top = static_cast<NS::UInteger>(std::floor(std::clamp(clip.top, 0.0F, 1.0F) * height));
        const auto right = static_cast<NS::UInteger>(std::ceil(std::clamp(clip.right, 0.0F, 1.0F) * width));
        const auto bottom = static_cast<NS::UInteger>(std::ceil(std::clamp(clip.bottom, 0.0F, 1.0F) * height));
        encoder->setScissorRect({left, top, right - left, bottom - top});
    };
    gfx::CommandView command{};
    while (decoder.next(command)) {
        if (command.opcode == gfx::Opcode::clear) {
            gfx::Color clear{};
            if (!gfx::decodeClear(command, clear)) {
                throw std::runtime_error("Malformed clear command");
            }
            renderPass->colorAttachments()->object(0)->setClearColor(
                MTL::ClearColor(clear.red, clear.green, clear.blue, clear.alpha));
        } else if (command.opcode == gfx::Opcode::draw) {
            gfx::DrawCommand draw{};
            if (!gfx::decodeDraw(command, draw) ||
                draw.primitive != gfx::Primitive::triangleList) {
                throw std::runtime_error("Malformed or unsupported draw command");
            }
            for (gfx::Vertex& vertex : draw.vertices) {
                vertex.position = transformPoint(currentTransform(), vertex.position);
                vertex.color[3] *= opacityStack.back();
            }
            if (encoder == nullptr) {
                encoder = commandBuffer->renderCommandEncoder(renderPass);
                applyClip();
            }
            encoder->setRenderPipelineState(pipelineState_.get());
            constexpr std::size_t maxInlineBytes = 4096;
            constexpr std::size_t verticesPerTriangle = 3;
            constexpr std::size_t maxInlineVertices =
                (maxInlineBytes / sizeof(gfx::Vertex) / verticesPerTriangle) *
                verticesPerTriangle;
            static_assert(maxInlineVertices > 0);

            for (std::size_t firstVertex = 0; !clipEmpty() && firstVertex < draw.vertices.size();) {
                const std::size_t vertexCount =
                    std::min(maxInlineVertices, draw.vertices.size() - firstVertex);
                encoder->setVertexBytes(draw.vertices.data() + firstVertex,
                                        vertexCount * sizeof(gfx::Vertex),
                                        0);
                encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                        static_cast<NS::UInteger>(0),
                                        static_cast<NS::UInteger>(vertexCount));
                firstVertex += vertexCount;
            }
        } else if (command.opcode == gfx::Opcode::pushClip) {
            gfx::ClipRect clip{};
            if (!gfx::decodePushClip(command, clip)) {
                throw std::runtime_error("Malformed push-clip command");
            }
            const std::array<std::array<float, 2>, 4> corners = {{
                {clip.left * 2.0F - 1.0F, 1.0F - clip.top * 2.0F},
                {clip.right * 2.0F - 1.0F, 1.0F - clip.top * 2.0F},
                {clip.right * 2.0F - 1.0F, 1.0F - clip.bottom * 2.0F},
                {clip.left * 2.0F - 1.0F, 1.0F - clip.bottom * 2.0F},
            }};
            float left = 1.0F, top = 1.0F, right = 0.0F, bottom = 0.0F;
            for (const auto& corner : corners) {
                const auto point = transformPoint(currentTransform(), corner);
                const float x = (point[0] + 1.0F) * 0.5F;
                const float y = (1.0F - point[1]) * 0.5F;
                left = std::min(left, x); top = std::min(top, y);
                right = std::max(right, x); bottom = std::max(bottom, y);
            }
            clip = {left, top, right, bottom};
            if (!clipStack.empty()) {
                const gfx::ClipRect parent = clipStack.back();
                clip.left = std::max(clip.left, parent.left);
                clip.top = std::max(clip.top, parent.top);
                clip.right = std::min(clip.right, parent.right);
                clip.bottom = std::min(clip.bottom, parent.bottom);
            }
            clipStack.push_back(clip);
            applyClip();
        } else if (command.opcode == gfx::Opcode::drawImage) {
            gfx::ImageCommand image{};
            if (!gfx::decodeImage(command, image)) {
                throw std::runtime_error("Malformed image command");
            }
            const auto found = textures_.find(image.textureId);
            if (found == textures_.end() || clipEmpty()) continue;
            struct ImageVertex {
                std::array<float, 2> position;
                std::array<float, 2> uv;
                std::array<float, 4> tint;
            };
            const std::array<float, 4> tint = {image.tint.red, image.tint.green,
                                               image.tint.blue,
                                               image.tint.alpha * opacityStack.back()};
            ImageVertex vertices[] = {
                {{image.destination.left, image.destination.top}, {image.uv.left, image.uv.top}, tint},
                {{image.destination.left, image.destination.bottom}, {image.uv.left, image.uv.bottom}, tint},
                {{image.destination.right, image.destination.bottom}, {image.uv.right, image.uv.bottom}, tint},
                {{image.destination.left, image.destination.top}, {image.uv.left, image.uv.top}, tint},
                {{image.destination.right, image.destination.bottom}, {image.uv.right, image.uv.bottom}, tint},
                {{image.destination.right, image.destination.top}, {image.uv.right, image.uv.top}, tint},
            };
            for (ImageVertex& vertex : vertices) {
                vertex.position = transformPoint(currentTransform(), vertex.position);
            }
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(imagePipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->setFragmentTexture(found->second.get(), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawImageSurface) {
            gfx::ImageSurfaceCommand image{};
            if (!gfx::decodeImageSurface(command, image) ||
                !std::isfinite(image.cornerRadius) || image.cornerRadius < 0.0F ||
                image.cornerRadius > 8192.0F) {
                throw std::runtime_error("Malformed image-surface command");
            }
            const auto found = textures_.find(image.textureId);
            if (found == textures_.end() || clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (image.destination.right - image.destination.left) * drawableWidth * 0.5F,
                (image.destination.top - image.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            struct ImageSurfaceVertex {
                std::array<float, 2> position;
                std::array<float, 2> uv;
                std::array<float, 2> local;
                std::array<float, 2> size;
                float cornerRadius;
                float sampling;
                std::array<float, 4> tint;
            };
            const std::array<float, 4> tint = {image.tint.red, image.tint.green,
                image.tint.blue, image.tint.alpha * opacityStack.back()};
            const float sampling = image.sampling == gfx::ImageSampling::nearest ? 1.0F : 0.0F;
            const auto vertex = [&](float x, float y, float u, float v,
                                    float localX, float localY) {
                return ImageSurfaceVertex{transformPoint(currentTransform(), {x, y}), {u, v},
                    {localX, localY}, size, image.cornerRadius, sampling, tint};
            };
            const ImageSurfaceVertex vertices[] = {
                vertex(image.destination.left, image.destination.top,
                       image.uv.left, image.uv.top, 0.0F, 0.0F),
                vertex(image.destination.left, image.destination.bottom,
                       image.uv.left, image.uv.bottom, 0.0F, size[1]),
                vertex(image.destination.right, image.destination.bottom,
                       image.uv.right, image.uv.bottom, size[0], size[1]),
                vertex(image.destination.left, image.destination.top,
                       image.uv.left, image.uv.top, 0.0F, 0.0F),
                vertex(image.destination.right, image.destination.bottom,
                       image.uv.right, image.uv.bottom, size[0], size[1]),
                vertex(image.destination.right, image.destination.top,
                       image.uv.right, image.uv.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(imageSurfacePipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->setFragmentTexture(found->second.get(), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawShadow) {
            gfx::ShadowCommand shadow{};
            if (!gfx::decodeShadow(command, shadow) || !std::isfinite(shadow.cornerRadius) ||
                !std::isfinite(shadow.blur) || !std::isfinite(shadow.spread) ||
                shadow.cornerRadius < 0.0F || shadow.blur < 0.0F || shadow.blur > 256.0F ||
                shadow.spread < -256.0F || shadow.spread > 256.0F) {
                throw std::runtime_error("Malformed shadow command");
            }
            if (clipEmpty() || shadow.color.alpha <= 0.0F) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const float width = (shadow.destination.right - shadow.destination.left) *
                                drawableWidth * 0.5F;
            const float height = (shadow.destination.top - shadow.destination.bottom) *
                                 drawableHeight * 0.5F;
            const std::array<float, 2> halfSize = {
                std::max(0.0F, width * 0.5F + shadow.spread),
                std::max(0.0F, height * 0.5F + shadow.spread)};
            if (halfSize[0] <= 0.0F || halfSize[1] <= 0.0F) continue;
            const std::array<float, 2> extent = {
                halfSize[0] + shadow.blur * 2.0F,
                halfSize[1] + shadow.blur * 2.0F};
            const float centerX = (shadow.destination.left + shadow.destination.right) * 0.5F;
            const float centerY = (shadow.destination.top + shadow.destination.bottom) * 0.5F;
            const float extentX = extent[0] / drawableWidth * 2.0F;
            const float extentY = extent[1] / drawableHeight * 2.0F;
            struct ShadowVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> halfSize;
                float radius;
                float blur;
                std::array<float, 4> color;
            };
            const float radius = std::max(0.0F, shadow.cornerRadius + shadow.spread);
            const std::array<float, 4> color = {shadow.color.red, shadow.color.green,
                shadow.color.blue, shadow.color.alpha * opacityStack.back()};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return ShadowVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, halfSize, radius, shadow.blur, color};
            };
            const ShadowVertex vertices[] = {
                vertex(centerX - extentX, centerY + extentY, -extent[0], -extent[1]),
                vertex(centerX - extentX, centerY - extentY, -extent[0], extent[1]),
                vertex(centerX + extentX, centerY - extentY, extent[0], extent[1]),
                vertex(centerX - extentX, centerY + extentY, -extent[0], -extent[1]),
                vertex(centerX + extentX, centerY - extentY, extent[0], extent[1]),
                vertex(centerX + extentX, centerY + extentY, extent[0], -extent[1]),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(shadowPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawRadialGradient) {
            gfx::RadialGradientCommand gradient{};
            if (!gfx::decodeRadialGradient(command, gradient) ||
                !std::isfinite(gradient.centerX) || !std::isfinite(gradient.centerY) ||
                !std::isfinite(gradient.radius) || !std::isfinite(gradient.cornerRadius) ||
                gradient.centerX < 0.0F || gradient.centerX > 1.0F ||
                gradient.centerY < 0.0F || gradient.centerY > 1.0F ||
                gradient.radius <= 0.0F || gradient.radius > 8192.0F ||
                gradient.cornerRadius < 0.0F) {
                throw std::runtime_error("Malformed radial-gradient command");
            }
            if (clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (gradient.destination.right - gradient.destination.left) * drawableWidth * 0.5F,
                (gradient.destination.top - gradient.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            const std::array<float, 2> center = {
                gradient.centerX * size[0], gradient.centerY * size[1]};
            struct RadialVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                std::array<float, 2> center;
                float radius;
                float cornerRadius;
                std::array<float, 4> innerColor;
                std::array<float, 4> outerColor;
            };
            const std::array<float, 4> inner = {gradient.innerColor.red, gradient.innerColor.green,
                gradient.innerColor.blue, gradient.innerColor.alpha * opacityStack.back()};
            const std::array<float, 4> outer = {gradient.outerColor.red, gradient.outerColor.green,
                gradient.outerColor.blue, gradient.outerColor.alpha * opacityStack.back()};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return RadialVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, center, gradient.radius, gradient.cornerRadius,
                    inner, outer};
            };
            const RadialVertex vertices[] = {
                vertex(gradient.destination.left, gradient.destination.top, 0.0F, 0.0F),
                vertex(gradient.destination.left, gradient.destination.bottom, 0.0F, size[1]),
                vertex(gradient.destination.right, gradient.destination.bottom, size[0], size[1]),
                vertex(gradient.destination.left, gradient.destination.top, 0.0F, 0.0F),
                vertex(gradient.destination.right, gradient.destination.bottom, size[0], size[1]),
                vertex(gradient.destination.right, gradient.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(radialPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawRoundedRect) {
            gfx::RoundedRectCommand rectangle{};
            if (!gfx::decodeRoundedRect(command, rectangle) ||
                !std::isfinite(rectangle.cornerRadius) ||
                !std::isfinite(rectangle.borderWidth) || rectangle.cornerRadius < 0.0F ||
                rectangle.borderWidth < 0.0F || rectangle.cornerRadius > 8192.0F ||
                rectangle.borderWidth > 8192.0F) {
                throw std::runtime_error("Malformed rounded-rectangle command");
            }
            if (clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (rectangle.destination.right - rectangle.destination.left) * drawableWidth * 0.5F,
                (rectangle.destination.top - rectangle.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            struct RoundedRectVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                float radius;
                float borderWidth;
                std::array<float, 4> fillColor;
                std::array<float, 4> borderColor;
            };
            const std::array<float, 4> fill = {rectangle.fillColor.red, rectangle.fillColor.green,
                rectangle.fillColor.blue, rectangle.fillColor.alpha * opacityStack.back()};
            const std::array<float, 4> border = {rectangle.borderColor.red,
                rectangle.borderColor.green, rectangle.borderColor.blue,
                rectangle.borderColor.alpha * opacityStack.back()};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return RoundedRectVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, rectangle.cornerRadius, rectangle.borderWidth,
                    fill, border};
            };
            const RoundedRectVertex vertices[] = {
                vertex(rectangle.destination.left, rectangle.destination.top, 0.0F, 0.0F),
                vertex(rectangle.destination.left, rectangle.destination.bottom, 0.0F, size[1]),
                vertex(rectangle.destination.right, rectangle.destination.bottom, size[0], size[1]),
                vertex(rectangle.destination.left, rectangle.destination.top, 0.0F, 0.0F),
                vertex(rectangle.destination.right, rectangle.destination.bottom, size[0], size[1]),
                vertex(rectangle.destination.right, rectangle.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(roundedRectPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawCircle) {
            gfx::CircleCommand circle{};
            if (!gfx::decodeCircle(command, circle) || !std::isfinite(circle.borderWidth) ||
                circle.borderWidth < 0.0F || circle.borderWidth > 8192.0F) {
                throw std::runtime_error("Malformed circle command");
            }
            if (clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (circle.destination.right - circle.destination.left) * drawableWidth * 0.5F,
                (circle.destination.top - circle.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            struct CircleVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                float borderWidth;
                std::array<float, 4> fillColor;
                std::array<float, 4> borderColor;
            };
            const std::array<float, 4> fill = {circle.fillColor.red, circle.fillColor.green,
                circle.fillColor.blue, circle.fillColor.alpha * opacityStack.back()};
            const std::array<float, 4> border = {circle.borderColor.red, circle.borderColor.green,
                circle.borderColor.blue, circle.borderColor.alpha * opacityStack.back()};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return CircleVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, circle.borderWidth, fill, border};
            };
            const CircleVertex vertices[] = {
                vertex(circle.destination.left, circle.destination.top, 0.0F, 0.0F),
                vertex(circle.destination.left, circle.destination.bottom, 0.0F, size[1]),
                vertex(circle.destination.right, circle.destination.bottom, size[0], size[1]),
                vertex(circle.destination.left, circle.destination.top, 0.0F, 0.0F),
                vertex(circle.destination.right, circle.destination.bottom, size[0], size[1]),
                vertex(circle.destination.right, circle.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(circlePipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawDiagonalPattern) {
            gfx::DiagonalPatternCommand pattern{};
            if (!gfx::decodeDiagonalPattern(command, pattern) ||
                !std::isfinite(pattern.stripeWidth) || !std::isfinite(pattern.gap) ||
                !std::isfinite(pattern.offset) || pattern.stripeWidth <= 0.0F ||
                pattern.gap < 0.0F || pattern.stripeWidth > 1024.0F || pattern.gap > 1024.0F) {
                throw std::runtime_error("Malformed diagonal-pattern command");
            }
            if (clipEmpty() || pattern.color.alpha <= 0.0F) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (pattern.destination.right - pattern.destination.left) * drawableWidth * 0.5F,
                (pattern.destination.top - pattern.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            struct PatternVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                float stripeWidth;
                float gap;
                float offset;
                float backward;
                std::array<float, 4> color;
            };
            const std::array<float, 4> color = {pattern.color.red, pattern.color.green,
                pattern.color.blue, pattern.color.alpha * opacityStack.back()};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return PatternVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, pattern.stripeWidth, pattern.gap, pattern.offset,
                    pattern.backward ? 1.0F : 0.0F, color};
            };
            const PatternVertex vertices[] = {
                vertex(pattern.destination.left, pattern.destination.top, 0.0F, 0.0F),
                vertex(pattern.destination.left, pattern.destination.bottom, 0.0F, size[1]),
                vertex(pattern.destination.right, pattern.destination.bottom, size[0], size[1]),
                vertex(pattern.destination.left, pattern.destination.top, 0.0F, 0.0F),
                vertex(pattern.destination.right, pattern.destination.bottom, size[0], size[1]),
                vertex(pattern.destination.right, pattern.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(patternPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawGridPattern) {
            gfx::GridPatternCommand pattern{};
            if (!gfx::decodeGridPattern(command, pattern) ||
                !std::isfinite(pattern.spacing) || !std::isfinite(pattern.minorWidth) ||
                !std::isfinite(pattern.majorWidth) || !std::isfinite(pattern.offsetX) ||
                !std::isfinite(pattern.offsetY) || !std::isfinite(pattern.cornerRadius) ||
                pattern.spacing < 2.0F ||
                pattern.spacing > 1024.0F || pattern.minorWidth < 0.0F ||
                pattern.majorWidth < 0.0F || pattern.minorWidth > pattern.spacing ||
                pattern.majorWidth > pattern.spacing || pattern.cornerRadius < 0.0F ||
                pattern.cornerRadius > 8192.0F) {
                throw std::runtime_error("Malformed grid-pattern command");
            }
            if (clipEmpty() || (pattern.minorColor.alpha <= 0.0F &&
                                pattern.majorColor.alpha <= 0.0F)) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (pattern.destination.right - pattern.destination.left) * drawableWidth * 0.5F,
                (pattern.destination.top - pattern.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            struct GridPatternVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                float spacing;
                float minorWidth;
                float majorWidth;
                std::array<float, 2> offset;
                float majorEvery;
                float cornerRadius;
                std::array<float, 4> minorColor;
                std::array<float, 4> majorColor;
            };
            const std::array<float, 4> minor = {pattern.minorColor.red, pattern.minorColor.green,
                pattern.minorColor.blue, pattern.minorColor.alpha * opacityStack.back()};
            const std::array<float, 4> major = {pattern.majorColor.red, pattern.majorColor.green,
                pattern.majorColor.blue, pattern.majorColor.alpha * opacityStack.back()};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return GridPatternVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, pattern.spacing, pattern.minorWidth,
                    pattern.majorWidth, {pattern.offsetX, pattern.offsetY},
                    static_cast<float>(pattern.majorEvery), pattern.cornerRadius, minor, major};
            };
            const GridPatternVertex vertices[] = {
                vertex(pattern.destination.left, pattern.destination.top, 0.0F, 0.0F),
                vertex(pattern.destination.left, pattern.destination.bottom, 0.0F, size[1]),
                vertex(pattern.destination.right, pattern.destination.bottom, size[0], size[1]),
                vertex(pattern.destination.left, pattern.destination.top, 0.0F, 0.0F),
                vertex(pattern.destination.right, pattern.destination.bottom, size[0], size[1]),
                vertex(pattern.destination.right, pattern.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(gridPatternPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawLinearGradient ||
                   command.opcode == gfx::Opcode::drawLinearGradientCircle) {
            const bool circleMask = command.opcode == gfx::Opcode::drawLinearGradientCircle;
            gfx::LinearGradientCommand gradient{};
            bool decoded = false;
            if (circleMask) {
                gfx::LinearGradientCircleCommand circle{};
                decoded = gfx::decodeLinearGradientCircle(command, circle);
                if (decoded) gradient = {circle.destination, 0.0F, circle.direction,
                                         circle.startColor, circle.endColor};
            } else {
                decoded = gfx::decodeLinearGradient(command, gradient);
            }
            if (!decoded ||
                !std::isfinite(gradient.cornerRadius) || gradient.cornerRadius < 0.0F ||
                gradient.cornerRadius > 8192.0F) {
                throw std::runtime_error("Malformed linear-gradient command");
            }
            if (clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (gradient.destination.right - gradient.destination.left) * drawableWidth * 0.5F,
                (gradient.destination.top - gradient.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            struct LinearGradientVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                float cornerRadius;
                float direction;
                std::array<float, 4> startColor;
                std::array<float, 4> endColor;
            };
            const std::array<float, 4> start = {gradient.startColor.red, gradient.startColor.green,
                gradient.startColor.blue, gradient.startColor.alpha * opacityStack.back()};
            const std::array<float, 4> end = {gradient.endColor.red, gradient.endColor.green,
                gradient.endColor.blue, gradient.endColor.alpha * opacityStack.back()};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return LinearGradientVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, gradient.cornerRadius,
                    static_cast<float>(gradient.direction), start, end};
            };
            const LinearGradientVertex vertices[] = {
                vertex(gradient.destination.left, gradient.destination.top, 0.0F, 0.0F),
                vertex(gradient.destination.left, gradient.destination.bottom, 0.0F, size[1]),
                vertex(gradient.destination.right, gradient.destination.bottom, size[0], size[1]),
                vertex(gradient.destination.left, gradient.destination.top, 0.0F, 0.0F),
                vertex(gradient.destination.right, gradient.destination.bottom, size[0], size[1]),
                vertex(gradient.destination.right, gradient.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(circleMask
                ? linearGradientCirclePipelineState_.get() : linearGradientPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawConicGradient) {
            gfx::ConicGradientCommand gradient{};
            if (!gfx::decodeConicGradient(command, gradient) ||
                !std::isfinite(gradient.centerX) || !std::isfinite(gradient.centerY) ||
                !std::isfinite(gradient.rotation) || !std::isfinite(gradient.cornerRadius) ||
                gradient.centerX < 0.0F || gradient.centerX > 1.0F ||
                gradient.centerY < 0.0F || gradient.centerY > 1.0F ||
                gradient.cornerRadius < 0.0F || gradient.cornerRadius > 8192.0F) {
                throw std::runtime_error("Malformed conic-gradient command");
            }
            if (clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (gradient.destination.right - gradient.destination.left) * drawableWidth * 0.5F,
                (gradient.destination.top - gradient.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= 0.0F || size[1] <= 0.0F) continue;
            struct ConicGradientVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                std::array<float, 2> center;
                float rotation;
                float cornerRadius;
                std::array<float, 4> startColor;
                std::array<float, 4> middleColor;
                std::array<float, 4> endColor;
            };
            const float opacity = opacityStack.back();
            const auto color = [opacity](gfx::Color value) {
                return std::array<float, 4>{value.red, value.green, value.blue,
                                            value.alpha * opacity};
            };
            const std::array<float, 2> center = {gradient.centerX * size[0],
                                                  gradient.centerY * size[1]};
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return ConicGradientVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, center, gradient.rotation, gradient.cornerRadius,
                    color(gradient.startColor), color(gradient.middleColor),
                    color(gradient.endColor)};
            };
            const ConicGradientVertex vertices[] = {
                vertex(gradient.destination.left, gradient.destination.top, 0.0F, 0.0F),
                vertex(gradient.destination.left, gradient.destination.bottom, 0.0F, size[1]),
                vertex(gradient.destination.right, gradient.destination.bottom, size[0], size[1]),
                vertex(gradient.destination.left, gradient.destination.top, 0.0F, 0.0F),
                vertex(gradient.destination.right, gradient.destination.bottom, size[0], size[1]),
                vertex(gradient.destination.right, gradient.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(conicGradientPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawDotGrid) {
            gfx::DotGridCommand grid{};
            if (!gfx::decodeDotGrid(command, grid) || grid.rows == 0 || grid.columns == 0 ||
                grid.rows > 32 || grid.columns > 32 || grid.rows * grid.columns > 32 ||
                grid.activeIndex < -1 ||
                grid.activeIndex >= static_cast<std::int32_t>(grid.rows * grid.columns) ||
                !std::isfinite(grid.inset) || !std::isfinite(grid.radius) ||
                !std::isfinite(grid.borderWidth) || grid.inset < 0.0F || grid.radius <= 0.0F ||
                grid.radius > 1024.0F || grid.borderWidth < 0.0F || grid.borderWidth > 1024.0F) {
                throw std::runtime_error("Malformed dot-grid command");
            }
            if (clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (grid.destination.right - grid.destination.left) * drawableWidth * 0.5F,
                (grid.destination.top - grid.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= grid.inset * 2.0F || size[1] <= grid.inset * 2.0F) continue;
            struct DotGridVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                std::uint32_t rows;
                std::uint32_t columns;
                std::uint32_t filledMask;
                std::uint32_t activeIndex;
                float inset;
                float radius;
                float borderWidth;
                std::array<float, 4> fillColor;
                std::array<float, 4> ringColor;
                std::array<float, 4> highlightColor;
            };
            const float opacity = opacityStack.back();
            const auto color = [opacity](gfx::Color value) {
                return std::array<float, 4>{value.red, value.green, value.blue,
                                            value.alpha * opacity};
            };
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return DotGridVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, grid.rows, grid.columns, grid.filledMask,
                    static_cast<std::uint32_t>(grid.activeIndex), grid.inset, grid.radius,
                    grid.borderWidth, color(grid.fillColor), color(grid.ringColor),
                    color(grid.highlightColor)};
            };
            const DotGridVertex vertices[] = {
                vertex(grid.destination.left, grid.destination.top, 0.0F, 0.0F),
                vertex(grid.destination.left, grid.destination.bottom, 0.0F, size[1]),
                vertex(grid.destination.right, grid.destination.bottom, size[0], size[1]),
                vertex(grid.destination.left, grid.destination.top, 0.0F, 0.0F),
                vertex(grid.destination.right, grid.destination.bottom, size[0], size[1]),
                vertex(grid.destination.right, grid.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(dotGridPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawWaveDots) {
            gfx::WaveDotsCommand wave{};
            if (!gfx::decodeWaveDots(command, wave) || wave.count == 0 || wave.count > 256 ||
                !std::isfinite(wave.inset) || !std::isfinite(wave.minimumRadius) ||
                !std::isfinite(wave.maximumRadius) || !std::isfinite(wave.phase) ||
                !std::isfinite(wave.frequency) || !std::isfinite(wave.borderWidth) ||
                wave.inset < 0.0F || wave.minimumRadius <= 0.0F ||
                wave.maximumRadius < wave.minimumRadius || wave.maximumRadius > 4096.0F ||
                wave.borderWidth < 0.0F || wave.borderWidth > 1024.0F) {
                throw std::runtime_error("Malformed wave-dots command");
            }
            if (clipEmpty()) continue;
            const float drawableWidth = static_cast<float>(drawable->texture()->width());
            const float drawableHeight = static_cast<float>(drawable->texture()->height());
            const std::array<float, 2> size = {
                (wave.destination.right - wave.destination.left) * drawableWidth * 0.5F,
                (wave.destination.top - wave.destination.bottom) * drawableHeight * 0.5F};
            if (size[0] <= wave.inset * 2.0F || size[1] <= wave.inset * 2.0F) continue;
            struct WaveDotsVertex {
                std::array<float, 2> position;
                std::array<float, 2> local;
                std::array<float, 2> size;
                std::uint32_t count;
                float inset;
                float minimumRadius;
                float maximumRadius;
                float phase;
                float frequency;
                float borderWidth;
                std::array<float, 4> troughStartColor;
                std::array<float, 4> troughEndColor;
                std::array<float, 4> crestStartColor;
                std::array<float, 4> crestEndColor;
                std::array<float, 4> borderColor;
            };
            const float opacity = opacityStack.back();
            const auto color = [opacity](gfx::Color value) {
                return std::array<float, 4>{value.red, value.green, value.blue,
                                            value.alpha * opacity};
            };
            const auto vertex = [&](float x, float y, float localX, float localY) {
                return WaveDotsVertex{transformPoint(currentTransform(), {x, y}),
                    {localX, localY}, size, wave.count, wave.inset, wave.minimumRadius,
                    wave.maximumRadius, wave.phase, wave.frequency, wave.borderWidth,
                    color(wave.troughStartColor), color(wave.troughEndColor),
                    color(wave.crestStartColor), color(wave.crestEndColor),
                    color(wave.borderColor)};
            };
            const WaveDotsVertex vertices[] = {
                vertex(wave.destination.left, wave.destination.top, 0.0F, 0.0F),
                vertex(wave.destination.left, wave.destination.bottom, 0.0F, size[1]),
                vertex(wave.destination.right, wave.destination.bottom, size[0], size[1]),
                vertex(wave.destination.left, wave.destination.top, 0.0F, 0.0F),
                vertex(wave.destination.right, wave.destination.bottom, size[0], size[1]),
                vertex(wave.destination.right, wave.destination.top, size[0], 0.0F),
            };
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(waveDotsPipelineState_.get());
            applyClip();
            encoder->setVertexBytes(vertices, sizeof(vertices), 0);
            encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                    static_cast<NS::UInteger>(0),
                                    static_cast<NS::UInteger>(6));
        } else if (command.opcode == gfx::Opcode::drawMesh) {
            gfx::MeshCommand mesh{};
            if (!gfx::decodeMesh(command, mesh) || !std::isfinite(mesh.viewBox.x) ||
                !std::isfinite(mesh.viewBox.y) || !std::isfinite(mesh.viewBox.width) ||
                !std::isfinite(mesh.viewBox.height) || mesh.viewBox.width <= 0.0F ||
                mesh.viewBox.height <= 0.0F) {
                throw std::runtime_error("Malformed mesh command");
            }
            const auto found = meshes_.find(mesh.meshId);
            if (found == meshes_.end() || clipEmpty()) continue;
            if (encoder == nullptr) encoder = commandBuffer->renderCommandEncoder(renderPass);
            encoder->setRenderPipelineState(pipelineState_.get());
            applyClip();
            constexpr std::size_t maxInlineBytes = 4096;
            constexpr std::size_t maxVertices = (maxInlineBytes / sizeof(gfx::Vertex) / 3) * 3;
            for (std::size_t first = 0; first < found->second.size();) {
                const std::size_t count = std::min(maxVertices, found->second.size() - first);
                std::vector<gfx::Vertex> vertices;
                vertices.reserve(count);
                for (std::size_t index = 0; index < count; ++index) {
                    gfx::Vertex vertex = found->second[first + index];
                    vertex.position = {
                        mesh.destination.left +
                            (vertex.position[0] - mesh.viewBox.x) / mesh.viewBox.width *
                            (mesh.destination.right - mesh.destination.left),
                        mesh.destination.top +
                            (vertex.position[1] - mesh.viewBox.y) / mesh.viewBox.height *
                            (mesh.destination.bottom - mesh.destination.top)};
                    vertex.position = transformPoint(currentTransform(), vertex.position);
                    vertex.color[3] *= opacityStack.back();
                    vertices.push_back(vertex);
                }
                encoder->setVertexBytes(vertices.data(), vertices.size() * sizeof(gfx::Vertex), 0);
                encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                        static_cast<NS::UInteger>(0),
                                        static_cast<NS::UInteger>(vertices.size()));
                first += count;
            }
        } else if (command.opcode == gfx::Opcode::drawPath ||
                   command.opcode == gfx::Opcode::drawDashedPath ||
                   command.opcode == gfx::Opcode::drawExtendedPath ||
                   command.opcode == gfx::Opcode::drawStyledPath ||
                   command.opcode == gfx::Opcode::drawDashArrayPath ||
                   command.opcode == gfx::Opcode::drawMultiGradientPath ||
                   command.opcode == gfx::Opcode::drawRadialPath ||
                   command.opcode == gfx::Opcode::drawMultiRadialPath ||
                   command.opcode == gfx::Opcode::drawFocalRadialPath ||
                   command.opcode == gfx::Opcode::drawTwoCircleRadialPath ||
                   command.opcode == gfx::Opcode::drawStyledRadialPath ||
                   command.opcode == gfx::Opcode::drawConicPath) {
            gfx::PathCommand path{};
            const auto finiteGradient = [](const gfx::PathGradient& gradient) {
                return std::isfinite(gradient.startX) && std::isfinite(gradient.startY) &&
                    std::isfinite(gradient.endX) && std::isfinite(gradient.endY) &&
                    std::isfinite(gradient.startColor.red) &&
                    std::isfinite(gradient.startColor.green) &&
                    std::isfinite(gradient.startColor.blue) &&
                    std::isfinite(gradient.startColor.alpha) &&
                    std::isfinite(gradient.endColor.red) &&
                    std::isfinite(gradient.endColor.green) &&
                    std::isfinite(gradient.endColor.blue) &&
                    std::isfinite(gradient.endColor.alpha) &&
                    std::all_of(gradient.stops.begin(), gradient.stops.end(),
                        [](const gfx::PathGradient::Stop& stop) {
                            return std::isfinite(stop.offset) && std::isfinite(stop.color.red) &&
                                std::isfinite(stop.color.green) && std::isfinite(stop.color.blue) &&
                                std::isfinite(stop.color.alpha);
                        });
            };
            if (!gfx::decodePath(command, path) || !std::isfinite(path.strokeWidth) ||
                !std::isfinite(path.tolerance) || path.strokeWidth < 0.0F ||
                !std::isfinite(path.dashLength) || !std::isfinite(path.gapLength) ||
                !std::isfinite(path.dashOffset) || path.dashLength < 0.0F ||
                path.gapLength < 0.0F ||
                std::any_of(path.dashPattern.begin(), path.dashPattern.end(),
                    [](float length) { return !std::isfinite(length) || length <= 0.0F; }) ||
                (path.fillGradient && !finiteGradient(path.gradient)) ||
                (path.strokeGradient && !finiteGradient(path.strokeGradientPaint)) ||
                ((path.fillRadialGradient || path.strokeRadialGradient) &&
                   (!std::isfinite(path.radialGradient.centerX) ||
                    !std::isfinite(path.radialGradient.centerY) ||
                    !std::isfinite(path.radialGradient.axisXX) ||
                    !std::isfinite(path.radialGradient.axisXY) ||
                    !std::isfinite(path.radialGradient.axisYX) ||
                    !std::isfinite(path.radialGradient.axisYY) ||
                    !std::isfinite(path.radialGradient.innerColor.red) ||
                    !std::isfinite(path.radialGradient.innerColor.green) ||
                    !std::isfinite(path.radialGradient.innerColor.blue) ||
                    !std::isfinite(path.radialGradient.innerColor.alpha) ||
                    !std::isfinite(path.radialGradient.outerColor.red) ||
                    !std::isfinite(path.radialGradient.outerColor.green) ||
                    !std::isfinite(path.radialGradient.outerColor.blue) ||
                    !std::isfinite(path.radialGradient.outerColor.alpha) ||
                    (path.radialGradient.hasFocalPoint &&
                     (!std::isfinite(path.radialGradient.focalX) ||
                      !std::isfinite(path.radialGradient.focalY))) ||
                    !std::isfinite(path.radialGradient.focalRadius) ||
                    path.radialGradient.focalRadius < 0.0F ||
                    path.radialGradient.focalRadius >= 1.0F ||
                    (!path.radialGradient.stops.empty() &&
                     (path.radialGradient.stops.size() < 2U ||
                      path.radialGradient.stops.size() > 8U ||
                      std::any_of(path.radialGradient.stops.begin(),
                                  path.radialGradient.stops.end(),
                          [](const gfx::PathGradient::Stop& stop) {
                              return !std::isfinite(stop.offset) ||
                                  !std::isfinite(stop.color.red) ||
                                  !std::isfinite(stop.color.green) ||
                                  !std::isfinite(stop.color.blue) ||
                                  !std::isfinite(stop.color.alpha);
                          }))) ||
                    std::fabs(path.radialGradient.axisXX * path.radialGradient.axisYY -
                              path.radialGradient.axisXY * path.radialGradient.axisYX) < 0.000001F)) ||
                ((path.fillConicGradient || path.strokeConicGradient) &&
                   (!std::isfinite(path.conicGradient.centerX) ||
                    !std::isfinite(path.conicGradient.centerY) ||
                    !std::isfinite(path.conicGradient.rotation) ||
                    path.conicGradient.stops.size() < 2U ||
                    path.conicGradient.stops.size() > 8U ||
                    std::any_of(path.conicGradient.stops.begin(), path.conicGradient.stops.end(),
                        [](const gfx::PathGradient::Stop& stop) {
                            return !std::isfinite(stop.offset) ||
                                !std::isfinite(stop.color.red) ||
                                !std::isfinite(stop.color.green) ||
                                !std::isfinite(stop.color.blue) ||
                                !std::isfinite(stop.color.alpha);
                        }))) ||
                path.tolerance <= 0.0F || path.viewBox.width <= 0.0F ||
                path.viewBox.height <= 0.0F) {
                throw std::runtime_error("Malformed path command");
            }
            const auto found = paths_.find(path.pathId);
            if (found == paths_.end() || clipEmpty()) continue;
            PathResource& resource = found->second;
            const auto sameStyle = [&](const CachedPath& cached) {
                return cached.fill == path.fill && cached.stroke == path.stroke &&
                       cached.fillRule == path.fillRule && cached.lineCap == path.lineCap &&
                       cached.lineJoin == path.lineJoin && cached.strokeWidth == path.strokeWidth &&
                       cached.tolerance == path.tolerance &&
                       cached.dashLength == path.dashLength &&
                       cached.gapLength == path.gapLength &&
                       cached.dashOffset == path.dashOffset &&
                       cached.miterLimit == path.miterLimit &&
                       cached.dashPattern == path.dashPattern;
            };
            auto cached = std::find_if(resource.cache.begin(), resource.cache.end(), sameStyle);
            if (cached == resource.cache.end()) {
                if (resource.cache.size() >= 16) resource.cache.erase(resource.cache.begin());
                resource.cache.push_back({path.fill, path.stroke, path.fillRule, path.lineCap,
                    path.lineJoin, path.strokeWidth, path.tolerance,
                    path.dashLength, path.gapLength, path.dashOffset, path.miterLimit,
                    path.dashPattern,
                    gfx::tessellatePath(resource.segments, path.fill, path.stroke,
                        path.fillRule, path.lineCap, path.lineJoin,
                        path.strokeWidth, path.tolerance,
                        path.dashLength, path.gapLength, path.dashOffset,
                        path.miterLimit, path.dashPattern)});
                cached = std::prev(resource.cache.end());
            }
            const auto drawPathTriangles = [&](const std::vector<gfx::PathPoint>& points,
                                               gfx::Color color,
                                               const gfx::PathGradient* gradient,
                                               const gfx::PathCommand::RadialGradient* radial,
                                               const gfx::PathCommand::ConicGradient* conic) {
                if (points.empty()) return;
                if (radial != nullptr || conic != nullptr) {
                    if (encoder == nullptr) {
                        encoder = commandBuffer->renderCommandEncoder(renderPass);
                        applyClip();
                    }
                    encoder->setRenderPipelineState(radialPathPipelineState_.get());
                    struct RadialPathVertex {
                        std::array<float, 2> position, source;
                    };
                    struct RadialPathUniforms {
                        std::array<float, 2> center, axisX, axisY, focal;
                        float radiusOrRotation = 0.0F;
                        std::uint32_t stopCount = 0;
                        std::uint32_t spread = 0;
                        std::uint32_t mode = 0;
                        std::array<std::array<float, 4>, 2> offsets{};
                        std::array<std::array<float, 4>, 8> colors{};
                    };
                    RadialPathUniforms uniforms{};
                    if (conic != nullptr) {
                        uniforms.center = {conic->centerX, conic->centerY};
                        uniforms.radiusOrRotation = conic->rotation;
                        uniforms.stopCount = static_cast<std::uint32_t>(conic->stops.size());
                        uniforms.mode = 1U;
                    } else {
                        uniforms.center = {radial->centerX, radial->centerY};
                        uniforms.axisX = {radial->axisXX, radial->axisXY};
                        uniforms.axisY = {radial->axisYX, radial->axisYY};
                        uniforms.radiusOrRotation = radial->focalRadius;
                        uniforms.stopCount = static_cast<std::uint32_t>(
                            radial->stops.empty() ? 2U : radial->stops.size());
                        uniforms.spread = static_cast<std::uint32_t>(radial->spread);
                    }
                    if (radial != nullptr && radial->hasFocalPoint) {
                        const float determinant = radial->axisXX * radial->axisYY -
                                                  radial->axisXY * radial->axisYX;
                        const float dx = radial->focalX - radial->centerX;
                        const float dy = radial->focalY - radial->centerY;
                        uniforms.focal = {
                            (dx * radial->axisYY - dy * radial->axisYX) / determinant,
                            (radial->axisXX * dy - radial->axisXY * dx) / determinant,
                        };
                        if (std::hypot(uniforms.focal[0], uniforms.focal[1]) +
                            uniforms.radiusOrRotation >= 1.0F)
                            throw std::runtime_error("Radial focal circle lies outside its field");
                    }
                    const auto setStop = [&](std::size_t index, float offset, gfx::Color stopColor) {
                        uniforms.offsets[index / 4U][index % 4U] = offset;
                        uniforms.colors[index] = {stopColor.red, stopColor.green, stopColor.blue,
                                                  stopColor.alpha * opacityStack.back()};
                    };
                    if (conic != nullptr) {
                        for (std::size_t index = 0; index < conic->stops.size(); ++index)
                            setStop(index, conic->stops[index].offset, conic->stops[index].color);
                    } else if (radial->stops.empty()) {
                        setStop(0, 0.0F, radial->innerColor);
                        setStop(1, 1.0F, radial->outerColor);
                    } else {
                        for (std::size_t index = 0; index < radial->stops.size(); ++index)
                            setStop(index, radial->stops[index].offset, radial->stops[index].color);
                    }
                    encoder->setFragmentBytes(&uniforms, sizeof(uniforms), 0);
                    constexpr std::size_t maxVertices = (4096 / sizeof(RadialPathVertex) / 3) * 3;
                    for (std::size_t first = 0; first < points.size();) {
                        const std::size_t count = std::min(maxVertices, points.size() - first);
                        std::vector<RadialPathVertex> vertices; vertices.reserve(count);
                        for (std::size_t index = 0; index < count; ++index) {
                            const gfx::PathPoint& point = points[first + index];
                            const float x = path.destination.left +
                                (point[0] - path.viewBox.x) / path.viewBox.width *
                                (path.destination.right - path.destination.left);
                            const float y = path.destination.top +
                                (point[1] - path.viewBox.y) / path.viewBox.height *
                                (path.destination.bottom - path.destination.top);
                            vertices.push_back({transformPoint(currentTransform(), {x, y}), point});
                        }
                        encoder->setVertexBytes(vertices.data(), vertices.size() * sizeof(RadialPathVertex), 0);
                        encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                            static_cast<NS::UInteger>(0),
                            static_cast<NS::UInteger>(vertices.size()));
                        first += count;
                    }
                    return;
                }
                const auto rawAmountAt = [](const gfx::PathPoint& point,
                                            const gfx::PathGradient& paint) {
                    const float dx = paint.endX - paint.startX;
                    const float dy = paint.endY - paint.startY;
                    const float lengthSquared = dx * dx + dy * dy;
                    return lengthSquared > 0.0F
                        ? ((point[0] - paint.startX) * dx +
                           (point[1] - paint.startY) * dy) / lengthSquared : 0.0F;
                };
                const auto mappedAmount = [](float raw, const gfx::PathGradient& paint,
                                             float intervalMidpoint) {
                    if (paint.spread == gfx::PathGradient::Spread::pad)
                        return std::clamp(raw, 0.0F, 1.0F);
                    const float cycle = std::floor(intervalMidpoint);
                    const float local = std::clamp(raw - cycle, 0.0F, 1.0F);
                    if (paint.spread == gfx::PathGradient::Spread::repeat) return local;
                    const auto cycleIndex = static_cast<long long>(cycle);
                    return cycleIndex % 2LL == 0LL ? local : 1.0F - local;
                };
                struct PaintedPoint { gfx::PathPoint point; float amount; };
                std::vector<PaintedPoint> renderedPoints;
                if (gradient == nullptr || (gradient->stops.size() <= 2 &&
                    gradient->spread == gfx::PathGradient::Spread::pad)) {
                    renderedPoints.reserve(points.size());
                    for (const gfx::PathPoint& point : points) {
                        renderedPoints.push_back({point, gradient == nullptr ? 0.0F :
                            mappedAmount(rawAmountAt(point, *gradient), *gradient, 0.0F)});
                    }
                } else {
                    std::vector<float> stopOffsets{0.0F, 1.0F};
                    if (!gradient->stops.empty()) {
                        stopOffsets.clear();
                        for (const auto& stop : gradient->stops) stopOffsets.push_back(stop.offset);
                        stopOffsets.push_back(0.0F); stopOffsets.push_back(1.0F);
                    }
                    const auto clip = [&](std::vector<gfx::PathPoint> polygon, float boundary,
                                          bool keepGreater) {
                        std::vector<gfx::PathPoint> result;
                        for (std::size_t index = 0; index < polygon.size(); ++index) {
                            const gfx::PathPoint& start = polygon[index];
                            const gfx::PathPoint& end = polygon[(index + 1) % polygon.size()];
                            const float startAmount = rawAmountAt(start, *gradient);
                            const float endAmount = rawAmountAt(end, *gradient);
                            const bool startInside = keepGreater ? startAmount >= boundary : startAmount <= boundary;
                            const bool endInside = keepGreater ? endAmount >= boundary : endAmount <= boundary;
                            if (startInside) result.push_back(start);
                            if (startInside != endInside && std::fabs(endAmount - startAmount) > 0.000001F) {
                                const float ratio = (boundary - startAmount) / (endAmount - startAmount);
                                result.push_back({start[0] + (end[0] - start[0]) * ratio,
                                                  start[1] + (end[1] - start[1]) * ratio});
                            }
                        }
                        return result;
                    };
                    for (std::size_t triangle = 0; triangle + 2 < points.size(); triangle += 3) {
                        float minimum = rawAmountAt(points[triangle], *gradient);
                        float maximum = minimum;
                        for (std::size_t index = 1; index < 3; ++index) {
                            const float amount = rawAmountAt(points[triangle + index], *gradient);
                            minimum = std::min(minimum, amount); maximum = std::max(maximum, amount);
                        }
                        std::vector<float> boundaries{minimum, maximum};
                        if (gradient->spread == gfx::PathGradient::Spread::pad) {
                            boundaries.insert(boundaries.end(), stopOffsets.begin(), stopOffsets.end());
                        } else if (maximum - minimum <= 128.0F) {
                            const int firstCycle = static_cast<int>(std::floor(minimum)) - 1;
                            const int lastCycle = static_cast<int>(std::ceil(maximum)) + 1;
                            for (int cycle = firstCycle; cycle <= lastCycle; ++cycle) {
                                boundaries.push_back(static_cast<float>(cycle));
                                for (float stop : stopOffsets) {
                                    const bool reflected = gradient->spread == gfx::PathGradient::Spread::reflect &&
                                        cycle % 2 != 0;
                                    boundaries.push_back(static_cast<float>(cycle) +
                                        (reflected ? 1.0F - stop : stop));
                                }
                            }
                        }
                        std::sort(boundaries.begin(), boundaries.end());
                        boundaries.erase(std::unique(boundaries.begin(), boundaries.end(),
                            [](float left, float right) { return std::fabs(left - right) < 0.000001F; }),
                            boundaries.end());
                        for (std::size_t interval = 0; interval + 1 < boundaries.size(); ++interval) {
                            if (boundaries[interval + 1] <= minimum || boundaries[interval] >= maximum) continue;
                            std::vector<gfx::PathPoint> polygon = {
                                points[triangle], points[triangle + 1], points[triangle + 2]};
                            polygon = clip(std::move(polygon), boundaries[interval], true);
                            if (polygon.size() < 3) continue;
                            polygon = clip(std::move(polygon), boundaries[interval + 1], false);
                            for (std::size_t index = 1; index + 1 < polygon.size(); ++index) {
                                const float midpoint = (boundaries[interval] + boundaries[interval + 1]) * 0.5F;
                                for (const gfx::PathPoint& point :
                                    {polygon[0], polygon[index], polygon[index + 1]}) {
                                    renderedPoints.push_back({point, mappedAmount(
                                        rawAmountAt(point, *gradient), *gradient, midpoint)});
                                }
                            }
                        }
                    }
                }
                if (encoder == nullptr) {
                    encoder = commandBuffer->renderCommandEncoder(renderPass);
                    applyClip();
                }
                encoder->setRenderPipelineState(pipelineState_.get());
                constexpr std::size_t maxInlineBytes = 4096;
                constexpr std::size_t maxVertices =
                    (maxInlineBytes / sizeof(gfx::Vertex) / 3) * 3;
                for (std::size_t first = 0; first < renderedPoints.size();) {
                    const std::size_t count = std::min(maxVertices, renderedPoints.size() - first);
                    std::vector<gfx::Vertex> vertices;
                    vertices.reserve(count);
                    for (std::size_t index = 0; index < count; ++index) {
                        const PaintedPoint& painted = renderedPoints[first + index];
                        const gfx::PathPoint& point = painted.point;
                        std::array<float, 4> vertexColor = {
                            color.red, color.green, color.blue, color.alpha};
                        if (gradient != nullptr) {
                            const float amount = painted.amount;
                            gfx::PathGradient::Stop start{0.0F, gradient->startColor};
                            gfx::PathGradient::Stop end{1.0F, gradient->endColor};
                            if (!gradient->stops.empty()) {
                                start = gradient->stops.front();
                                end = gradient->stops.back();
                                for (std::size_t stop = 1; stop < gradient->stops.size(); ++stop) {
                                    if (amount <= gradient->stops[stop].offset) {
                                        start = gradient->stops[stop - 1];
                                        end = gradient->stops[stop];
                                        break;
                                    }
                                }
                            }
                            const float span = end.offset - start.offset;
                            const float localAmount = span > 0.0F
                                ? std::clamp((amount - start.offset) / span, 0.0F, 1.0F) : 0.0F;
                            const auto mix = [localAmount](float first, float last) {
                                return first + (last - first) * localAmount;
                            };
                            vertexColor = {mix(start.color.red, end.color.red),
                                mix(start.color.green, end.color.green),
                                mix(start.color.blue, end.color.blue),
                                mix(start.color.alpha, end.color.alpha)};
                        }
                        vertexColor[3] *= opacityStack.back();
                        const float x = path.destination.left +
                            (point[0] - path.viewBox.x) / path.viewBox.width *
                            (path.destination.right - path.destination.left);
                        const float y = path.destination.top +
                            (point[1] - path.viewBox.y) / path.viewBox.height *
                            (path.destination.bottom - path.destination.top);
                        vertices.push_back({transformPoint(currentTransform(), {x, y}), vertexColor});
                    }
                    encoder->setVertexBytes(vertices.data(), vertices.size() * sizeof(gfx::Vertex), 0);
                    encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                            static_cast<NS::UInteger>(0),
                                            static_cast<NS::UInteger>(vertices.size()));
                    first += count;
                }
            };
            if (path.fill) drawPathTriangles(cached->triangles.fill, path.fillColor,
                path.fillGradient ? &path.gradient : nullptr,
                path.fillRadialGradient ? &path.radialGradient : nullptr,
                path.fillConicGradient ? &path.conicGradient : nullptr);
            if (path.stroke) drawPathTriangles(cached->triangles.stroke, path.strokeColor,
                path.strokeGradient ? &path.strokeGradientPaint : nullptr,
                path.strokeRadialGradient ? &path.radialGradient : nullptr,
                path.strokeConicGradient ? &path.conicGradient : nullptr);
        } else if (command.opcode == gfx::Opcode::drawText) {
            gfx::TextCommand text{};
            if (!gfx::decodeText(command, text) || !std::isfinite(text.left) ||
                !std::isfinite(text.top) || !std::isfinite(text.fontSize) ||
                text.fontSize <= 0.0F) {
                throw std::runtime_error("Malformed text command");
            }
            std::string cacheKey{static_cast<char>(text.family), static_cast<char>(text.weight),
                                 static_cast<char>(text.style)};
            cacheKey.append(reinterpret_cast<const char*>(&text.letterSpacing),
                            sizeof(text.letterSpacing));
            cacheKey.push_back(static_cast<char>(text.decoration));
            cacheKey.append(reinterpret_cast<const char*>(&text.fontResourceId),
                            sizeof(text.fontResourceId));
            const std::uint64_t fontVersion = gfx::fontResourceVersion(text.fontResourceId);
            cacheKey.append(reinterpret_cast<const char*>(&fontVersion), sizeof(fontVersion));
            cacheKey += text.text;
            auto [found, inserted] = textCache_.try_emplace(cacheKey);
            gfx::ShapedText& shaped = found->second;
            if (inserted) {
                shaped = gfx::shapeSystemText(
                    text.text, text.family, text.weight, text.style, text.letterSpacing,
                    text.fontResourceId);
                const auto appendDecoration = [&](float position, float thickness) {
                    const float half = std::max(thickness, 0.04F) * 0.5F;
                    const float left = 0.0F, right = shaped.advance;
                    const float top = position - half, bottom = position + half;
                    shaped.triangles.insert(shaped.triangles.end(), {
                        {left, top}, {left, bottom}, {right, bottom},
                        {left, top}, {right, bottom}, {right, top}});
                };
                if ((text.decoration & gfx::underlineText) != 0) {
                    appendDecoration(shaped.underlinePosition, shaped.underlineThickness);
                }
                if ((text.decoration & gfx::strikeThroughText) != 0) {
                    appendDecoration(shaped.strikeThroughPosition,
                                     shaped.strikeThroughThickness);
                }
            }
            const std::vector<gfx::PathPoint>& points = shaped.triangles;
            if (points.empty() || clipEmpty()) continue;
            if (encoder == nullptr) {
                encoder = commandBuffer->renderCommandEncoder(renderPass);
                applyClip();
            }
            encoder->setRenderPipelineState(pipelineState_.get());
            constexpr std::size_t maxInlineBytes = 4096;
            constexpr std::size_t maxVertices =
                (maxInlineBytes / sizeof(gfx::Vertex) / 3) * 3;
            const float aspect = static_cast<float>(drawable->texture()->height()) /
                                 static_cast<float>(drawable->texture()->width());
            const std::array<float, 4> color = {
                text.color.red, text.color.green, text.color.blue,
                text.color.alpha * opacityStack.back()};
            for (std::size_t first = 0; first < points.size();) {
                const std::size_t count = std::min(maxVertices, points.size() - first);
                std::vector<gfx::Vertex> vertices;
                vertices.reserve(count);
                for (std::size_t index = 0; index < count; ++index) {
                    const gfx::PathPoint& point = points[first + index];
                    vertices.push_back({transformPoint(currentTransform(),
                        {text.left + point[0] * text.fontSize * aspect,
                         text.top - point[1] * text.fontSize}), color});
                }
                encoder->setVertexBytes(vertices.data(), vertices.size() * sizeof(gfx::Vertex), 0);
                encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                        static_cast<NS::UInteger>(0),
                                        static_cast<NS::UInteger>(vertices.size()));
                first += count;
            }
        } else if (command.opcode == gfx::Opcode::drawRichText) {
            gfx::RichTextCommand rich{};
            if (!gfx::decodeRichText(command, rich)) {
                throw std::runtime_error("Malformed rich text command");
            }
            if (clipEmpty()) continue;
            const float aspect = static_cast<float>(drawable->texture()->height()) /
                                 static_cast<float>(drawable->texture()->width());
            std::vector<gfx::Vertex> vertices;
            float cursor = 0.0F;
            for (const gfx::RichTextRun& run : rich.runs) {
                std::string key{static_cast<char>(run.family), static_cast<char>(run.weight),
                                static_cast<char>(run.style)};
                key.append(reinterpret_cast<const char*>(&run.letterSpacing), sizeof(run.letterSpacing));
                key.push_back(static_cast<char>(run.decoration));
                key.append(reinterpret_cast<const char*>(&run.fontResourceId), sizeof(run.fontResourceId));
                const std::uint64_t version = gfx::fontResourceVersion(run.fontResourceId);
                key.append(reinterpret_cast<const char*>(&version), sizeof(version));
                key += run.text;
                auto [found, inserted] = textCache_.try_emplace(key);
                gfx::ShapedText& shaped = found->second;
                if (inserted) {
                    shaped = gfx::shapeSystemText(run.text, run.family, run.weight, run.style,
                                                  run.letterSpacing, run.fontResourceId);
                    const auto decorate = [&](float position, float thickness) {
                        const float half = std::max(thickness, 0.04F) * 0.5F;
                        shaped.triangles.insert(shaped.triangles.end(), {
                            {0.0F, position - half}, {0.0F, position + half},
                            {shaped.advance, position + half}, {0.0F, position - half},
                            {shaped.advance, position + half}, {shaped.advance, position - half}});
                    };
                    if ((run.decoration & gfx::underlineText) != 0)
                        decorate(shaped.underlinePosition, shaped.underlineThickness);
                    if ((run.decoration & gfx::strikeThroughText) != 0)
                        decorate(shaped.strikeThroughPosition, shaped.strikeThroughThickness);
                }
                const std::array<float, 4> color = {run.color.red, run.color.green, run.color.blue,
                                                     run.color.alpha * opacityStack.back()};
                vertices.reserve(vertices.size() + shaped.triangles.size());
                for (const gfx::PathPoint& point : shaped.triangles) {
                    vertices.push_back({transformPoint(currentTransform(),
                        {rich.left + (cursor + point[0]) * rich.fontSize * aspect,
                         rich.top - point[1] * rich.fontSize}), color});
                }
                cursor += shaped.advance;
            }
            if (vertices.empty()) continue;
            if (encoder == nullptr) { encoder = commandBuffer->renderCommandEncoder(renderPass); applyClip(); }
            encoder->setRenderPipelineState(pipelineState_.get());
            constexpr std::size_t richMaxVertices = (4096 / sizeof(gfx::Vertex) / 3) * 3;
            for (std::size_t first = 0; first < vertices.size(); first += richMaxVertices) {
                const std::size_t count = std::min(richMaxVertices, vertices.size() - first);
                encoder->setVertexBytes(vertices.data() + first, count * sizeof(gfx::Vertex), 0);
                encoder->drawPrimitives(MTL::PrimitiveTypeTriangle,
                                        static_cast<NS::UInteger>(0),
                                        static_cast<NS::UInteger>(count));
            }
        } else if (command.opcode == gfx::Opcode::popClip) {
            if (command.payloadSize != 0 || clipStack.empty()) {
                throw std::runtime_error("Malformed or unbalanced pop-clip command");
            }
            clipStack.pop_back();
            applyClip();
        } else if (command.opcode == gfx::Opcode::pushTransform) {
            gfx::AffineTransform transform{};
            if (!gfx::decodePushTransform(command, transform) || !finiteTransform(transform)) {
                throw std::runtime_error("Malformed push-transform command");
            }
            transformStack.push_back(concatenate(currentTransform(), transform));
        } else if (command.opcode == gfx::Opcode::popTransform) {
            if (command.payloadSize != 0 || transformStack.size() <= 1) {
                throw std::runtime_error("Malformed or unbalanced pop-transform command");
            }
            transformStack.pop_back();
        } else if (command.opcode == gfx::Opcode::pushOpacity) {
            float opacity = 0.0F;
            if (!gfx::decodePushOpacity(command, opacity) || !std::isfinite(opacity) ||
                opacity < 0.0F || opacity > 1.0F) {
                throw std::runtime_error("Malformed push-opacity command");
            }
            opacityStack.push_back(opacityStack.back() * opacity);
        } else if (command.opcode == gfx::Opcode::popOpacity) {
            if (command.payloadSize != 0 || opacityStack.size() <= 1) {
                throw std::runtime_error("Malformed or unbalanced pop-opacity command");
            }
            opacityStack.pop_back();
        }
        // End-frame and unknown opcodes need no Metal work. Unknown commands are
        // safely skippable because every protocol record carries its byte size.
    }
    if (!decoder.valid()) {
        throw std::runtime_error(decoder.error());
    }
    if (!clipStack.empty()) {
        throw std::runtime_error("Unbalanced graphics clip stack");
    }
    if (transformStack.size() != 1) {
        throw std::runtime_error("Unbalanced graphics transform stack");
    }
    if (opacityStack.size() != 1) {
        throw std::runtime_error("Unbalanced graphics opacity stack");
    }
    if (encoder == nullptr) {
        encoder = commandBuffer->renderCommandEncoder(renderPass);
    }
    encoder->endEncoding();

    commandBuffer->presentDrawable(drawable);
    return commandBuffer;
}
