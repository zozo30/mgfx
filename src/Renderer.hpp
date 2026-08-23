#pragma once

#include "GraphicsProtocol.hpp"
#include "VectorPath.hpp"

#include <Foundation/Foundation.hpp>
#include <Metal/Metal.hpp>
#include <QuartzCore/QuartzCore.hpp>
#include <cstdint>
#include <unordered_map>
#include <vector>

class Renderer final {
public:
    explicit Renderer(MTL::Device* device);

    Renderer(const Renderer&) = delete;
    Renderer& operator=(const Renderer&) = delete;

    MTL::CommandBuffer* encode(const std::vector<std::uint8_t>& commandStream,
                               MTL::RenderPassDescriptor* renderPass,
                               CA::MetalDrawable* drawable);
    void createTexture(std::uint32_t id, std::uint32_t width, std::uint32_t height,
                       const std::vector<std::uint8_t>& rgba);
    void destroyTexture(std::uint32_t id);
    void clearTextures();
    void createPath(std::uint32_t id, std::vector<mgfx::ipc::PathSegment> segments);
    void destroyPath(std::uint32_t id);
    void clearPaths();

private:
    NS::SharedPtr<MTL::Device> device_;
    NS::SharedPtr<MTL::CommandQueue> commandQueue_;
    NS::SharedPtr<MTL::RenderPipelineState> pipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> imagePipelineState_;
    std::unordered_map<std::uint32_t, NS::SharedPtr<MTL::Texture>> textures_;
    struct CachedPath {
        bool fill;
        bool stroke;
        gfx::FillRule fillRule;
        gfx::LineCap lineCap;
        gfx::LineJoin lineJoin;
        float strokeWidth;
        float tolerance;
        gfx::PathTriangles triangles;
    };
    struct PathResource {
        std::vector<mgfx::ipc::PathSegment> segments;
        std::vector<CachedPath> cache;
    };
    std::unordered_map<std::uint32_t, PathResource> paths_;
};
