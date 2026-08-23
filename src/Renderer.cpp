#include "Renderer.hpp"

#include <algorithm>
#include <cstddef>
#include <cmath>
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
    auto imageVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("imageVertexMain")));
    auto imageFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("imageFragmentMain")));
    auto shadowVertexFunction = NS::TransferPtr(library->newFunction(MTLSTR("shadowVertexMain")));
    auto shadowFragmentFunction = NS::TransferPtr(library->newFunction(MTLSTR("shadowFragmentMain")));
    if (!vertexFunction || !fragmentFunction || !imageVertexFunction || !imageFragmentFunction ||
        !shadowVertexFunction || !shadowFragmentFunction) {
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
        } else if (command.opcode == gfx::Opcode::drawPath) {
            gfx::PathCommand path{};
            if (!gfx::decodePath(command, path) || !std::isfinite(path.strokeWidth) ||
                !std::isfinite(path.tolerance) || path.strokeWidth < 0.0F ||
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
                       cached.tolerance == path.tolerance;
            };
            auto cached = std::find_if(resource.cache.begin(), resource.cache.end(), sameStyle);
            if (cached == resource.cache.end()) {
                if (resource.cache.size() >= 16) resource.cache.erase(resource.cache.begin());
                resource.cache.push_back({path.fill, path.stroke, path.fillRule, path.lineCap,
                    path.lineJoin, path.strokeWidth, path.tolerance,
                    gfx::tessellatePath(resource.segments, path.fill, path.stroke,
                        path.fillRule, path.lineCap, path.lineJoin,
                        path.strokeWidth, path.tolerance)});
                cached = std::prev(resource.cache.end());
            }
            const auto drawPathTriangles = [&](const std::vector<gfx::PathPoint>& points,
                                               gfx::Color color,
                                               const gfx::PathGradient* gradient) {
                if (points.empty()) return;
                if (encoder == nullptr) {
                    encoder = commandBuffer->renderCommandEncoder(renderPass);
                    applyClip();
                }
                encoder->setRenderPipelineState(pipelineState_.get());
                constexpr std::size_t maxInlineBytes = 4096;
                constexpr std::size_t maxVertices =
                    (maxInlineBytes / sizeof(gfx::Vertex) / 3) * 3;
                for (std::size_t first = 0; first < points.size();) {
                    const std::size_t count = std::min(maxVertices, points.size() - first);
                    std::vector<gfx::Vertex> vertices;
                    vertices.reserve(count);
                    for (std::size_t index = 0; index < count; ++index) {
                        const gfx::PathPoint& point = points[first + index];
                        std::array<float, 4> vertexColor = {
                            color.red, color.green, color.blue, color.alpha};
                        if (gradient != nullptr) {
                            const float dx = gradient->endX - gradient->startX;
                            const float dy = gradient->endY - gradient->startY;
                            const float lengthSquared = dx * dx + dy * dy;
                            const float amount = lengthSquared > 0.0F
                                ? std::clamp(((point[0] - gradient->startX) * dx +
                                              (point[1] - gradient->startY) * dy) /
                                             lengthSquared, 0.0F, 1.0F)
                                : 0.0F;
                            const auto mix = [amount](float start, float end) {
                                return start + (end - start) * amount;
                            };
                            vertexColor = {mix(gradient->startColor.red, gradient->endColor.red),
                                mix(gradient->startColor.green, gradient->endColor.green),
                                mix(gradient->startColor.blue, gradient->endColor.blue),
                                mix(gradient->startColor.alpha, gradient->endColor.alpha)};
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
                                             path.fillGradient ? &path.gradient : nullptr);
            if (path.stroke) drawPathTriangles(cached->triangles.stroke, path.strokeColor, nullptr);
        } else if (command.opcode == gfx::Opcode::drawText) {
            gfx::TextCommand text{};
            if (!gfx::decodeText(command, text) || !std::isfinite(text.left) ||
                !std::isfinite(text.top) || !std::isfinite(text.fontSize) ||
                text.fontSize <= 0.0F) {
                throw std::runtime_error("Malformed text command");
            }
            std::string cacheKey{static_cast<char>(text.family), static_cast<char>(text.weight)};
            cacheKey += text.text;
            auto [found, inserted] = textCache_.try_emplace(cacheKey);
            if (inserted) found->second = gfx::shapeSystemText(text.text, text.family, text.weight);
            const std::vector<gfx::PathPoint>& points = found->second.triangles;
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
