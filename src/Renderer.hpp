#pragma once

#include "GraphicsProtocol.hpp"
#include "ResourceBudget.hpp"
#include "SystemText.hpp"
#include "TextGeometryCache.hpp"
#include "VectorPath.hpp"

#include <Foundation/Foundation.hpp>
#include <Metal/Metal.hpp>
#include <QuartzCore/QuartzCore.hpp>
#include <cstdint>
#include <memory>
#include <unordered_map>
#include <vector>

class Renderer final {
public:
    explicit Renderer(MTL::Device* device, std::uint32_t sampleCount = 1);

    Renderer(const Renderer&) = delete;
    Renderer& operator=(const Renderer&) = delete;
    std::unique_ptr<Renderer> recreated(MTL::Device* device,
                                        std::uint32_t sampleCount) const;

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
    void createMesh(std::uint32_t id, const std::vector<mgfx::ipc::MeshVertex>& vertices,
                    const std::vector<std::uint32_t>& indices);
    void destroyMesh(std::uint32_t id);
    void clearMeshes();
    gfx::ResourceUsage textureUsage() const { return textureBudget_.usage(); }
    gfx::ResourceUsage pathUsage() const { return pathBudget_.usage(); }
    gfx::ResourceUsage meshUsage() const { return meshBudget_.usage(); }

private:
    void createTextureWithBacking(
        std::uint32_t id, std::uint32_t width, std::uint32_t height,
        std::shared_ptr<const std::vector<std::uint8_t>> rgba);
    NS::SharedPtr<MTL::Device> device_;
    NS::SharedPtr<MTL::CommandQueue> commandQueue_;
    NS::SharedPtr<MTL::RenderPipelineState> pipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> radialPathPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> pathTexturePipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> imagePipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> imageSurfacePipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> shadowPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> radialPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> roundedRectPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> circlePipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> arcPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> patternPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> gridPatternPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> linearGradientPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> linearGradientCirclePipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> dotGridPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> waveDotsPipelineState_;
    NS::SharedPtr<MTL::RenderPipelineState> conicGradientPipelineState_;
    struct TextureResource {
        std::uint32_t width;
        std::uint32_t height;
        std::shared_ptr<const std::vector<std::uint8_t>> rgba;
        NS::SharedPtr<MTL::Texture> texture;
    };
    std::unordered_map<std::uint32_t, TextureResource> textures_;
    struct CachedPath {
        bool fill;
        bool stroke;
        gfx::FillRule fillRule;
        gfx::LineCap lineCap;
        gfx::LineJoin lineJoin;
        float strokeWidth;
        float tolerance;
        float dashLength;
        float gapLength;
        float dashOffset;
        float miterLimit;
        std::vector<float> dashPattern;
        gfx::PathTriangles triangles;
    };
    struct PathResource {
        std::shared_ptr<const std::vector<mgfx::ipc::PathSegment>> segments;
        std::vector<CachedPath> cache;
    };
    std::unordered_map<std::uint32_t, PathResource> paths_;
    std::unordered_map<std::uint32_t, std::shared_ptr<const std::vector<gfx::Vertex>>> meshes_;
    gfx::TextGeometryCache textCache_;
    gfx::ResourceBudget textureBudget_{256, 256U * 1024U * 1024U};
    gfx::ResourceBudget pathBudget_{4096, 1'000'000};
    gfx::ResourceBudget meshBudget_{1024, 4'000'000};
};
