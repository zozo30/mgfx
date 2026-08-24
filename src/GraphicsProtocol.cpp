#include "GraphicsProtocol.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <stdexcept>

namespace gfx {
namespace {

constexpr std::size_t streamHeaderSize = 16;
constexpr std::size_t commandHeaderSize = 8;
constexpr std::size_t vertexWireSize = 24;

void appendU16(std::vector<std::uint8_t>& bytes, std::uint16_t value) {
    bytes.push_back(static_cast<std::uint8_t>(value));
    bytes.push_back(static_cast<std::uint8_t>(value >> 8));
}

void appendU32(std::vector<std::uint8_t>& bytes, std::uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        bytes.push_back(static_cast<std::uint8_t>(value >> shift));
    }
}

void appendFloat(std::vector<std::uint8_t>& bytes, float value) {
    static_assert(sizeof(float) == sizeof(std::uint32_t));
    std::uint32_t bits = 0;
    std::memcpy(&bits, &value, sizeof(bits));
    appendU32(bytes, bits);
}

std::uint16_t readU16(const std::uint8_t* bytes) {
    return static_cast<std::uint16_t>(bytes[0]) |
           static_cast<std::uint16_t>(bytes[1] << 8);
}

std::uint32_t readU32(const std::uint8_t* bytes) {
    return static_cast<std::uint32_t>(bytes[0]) |
           (static_cast<std::uint32_t>(bytes[1]) << 8) |
           (static_cast<std::uint32_t>(bytes[2]) << 16) |
           (static_cast<std::uint32_t>(bytes[3]) << 24);
}

float readFloat(const std::uint8_t* bytes) {
    const std::uint32_t bits = readU32(bytes);
    float value = 0.0F;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
}

void patchU32(std::vector<std::uint8_t>& bytes, std::size_t offset, std::uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        bytes[offset++] = static_cast<std::uint8_t>(value >> shift);
    }
}

} // namespace

CommandEncoder::CommandEncoder() {
    bytes_.insert(bytes_.end(), {'M', 'G', 'F', 'X'});
    appendU16(bytes_, protocolVersion);
    appendU16(bytes_, 0); // Stream flags, reserved for future use.
    appendU32(bytes_, 0); // Total byte count, patched by finish().
    appendU32(bytes_, 0); // Command count, patched by finish().
}

void CommandEncoder::beginCommand(Opcode opcode, std::uint32_t payloadSize) {
    if (finished_) {
        throw std::logic_error("Cannot append to a finished graphics command stream");
    }
    appendU16(bytes_, static_cast<std::uint16_t>(opcode));
    appendU16(bytes_, 0); // Command flags.
    appendU32(bytes_, payloadSize);
    ++commandCount_;
}

void CommandEncoder::clear(Color color) {
    beginCommand(Opcode::clear, 4 * sizeof(float));
    appendFloat(bytes_, color.red);
    appendFloat(bytes_, color.green);
    appendFloat(bytes_, color.blue);
    appendFloat(bytes_, color.alpha);
}

void CommandEncoder::draw(Primitive primitive,
                          const Vertex* vertices,
                          std::uint32_t vertexCount) {
    if (vertices == nullptr && vertexCount != 0) {
        throw std::invalid_argument("Vertex data is null");
    }
    if (vertexCount > (std::numeric_limits<std::uint32_t>::max() - 8) / vertexWireSize) {
        throw std::length_error("Too many vertices for one protocol command");
    }

    beginCommand(Opcode::draw, 8 + vertexCount * vertexWireSize);
    bytes_.push_back(static_cast<std::uint8_t>(primitive));
    bytes_.insert(bytes_.end(), 3, 0); // Alignment/reserved bytes.
    appendU32(bytes_, vertexCount);

    for (std::uint32_t index = 0; index < vertexCount; ++index) {
        appendFloat(bytes_, vertices[index].position[0]);
        appendFloat(bytes_, vertices[index].position[1]);
        for (float component : vertices[index].color) {
            appendFloat(bytes_, component);
        }
    }
}

void CommandEncoder::endFrame() {
    beginCommand(Opcode::endFrame, 0);
}

void CommandEncoder::pushClip(ClipRect clip) {
    beginCommand(Opcode::pushClip, 4 * sizeof(float));
    appendFloat(bytes_, clip.left);
    appendFloat(bytes_, clip.top);
    appendFloat(bytes_, clip.right);
    appendFloat(bytes_, clip.bottom);
}

void CommandEncoder::popClip() {
    beginCommand(Opcode::popClip, 0);
}

void CommandEncoder::pushTransform(AffineTransform transform) {
    beginCommand(Opcode::pushTransform, 6 * sizeof(float));
    for (float value : {transform.m11, transform.m12, transform.m21, transform.m22,
                        transform.translateX, transform.translateY}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::popTransform() {
    beginCommand(Opcode::popTransform, 0);
}

void CommandEncoder::pushOpacity(float opacity) {
    beginCommand(Opcode::pushOpacity, sizeof(float));
    appendFloat(bytes_, opacity);
}

void CommandEncoder::popOpacity() {
    beginCommand(Opcode::popOpacity, 0);
}

void CommandEncoder::drawShadow(const ShadowCommand& shadow) {
    beginCommand(Opcode::drawShadow, 11 * sizeof(float));
    for (float value : {shadow.destination.left, shadow.destination.top,
                        shadow.destination.right, shadow.destination.bottom,
                        shadow.cornerRadius, shadow.blur, shadow.spread,
                        shadow.color.red, shadow.color.green,
                        shadow.color.blue, shadow.color.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawRadialGradient(const RadialGradientCommand& gradient) {
    beginCommand(Opcode::drawRadialGradient, 16 * sizeof(float));
    for (float value : {gradient.destination.left, gradient.destination.top,
                        gradient.destination.right, gradient.destination.bottom,
                        gradient.centerX, gradient.centerY, gradient.radius,
                        gradient.cornerRadius,
                        gradient.innerColor.red, gradient.innerColor.green,
                        gradient.innerColor.blue, gradient.innerColor.alpha,
                        gradient.outerColor.red, gradient.outerColor.green,
                        gradient.outerColor.blue, gradient.outerColor.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawRoundedRect(const RoundedRectCommand& rectangle) {
    beginCommand(Opcode::drawRoundedRect, 14 * sizeof(float));
    for (float value : {rectangle.destination.left, rectangle.destination.top,
                        rectangle.destination.right, rectangle.destination.bottom,
                        rectangle.cornerRadius, rectangle.borderWidth,
                        rectangle.fillColor.red, rectangle.fillColor.green,
                        rectangle.fillColor.blue, rectangle.fillColor.alpha,
                        rectangle.borderColor.red, rectangle.borderColor.green,
                        rectangle.borderColor.blue, rectangle.borderColor.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawCircle(const CircleCommand& circle) {
    beginCommand(Opcode::drawCircle, 13 * sizeof(float));
    for (float value : {circle.destination.left, circle.destination.top,
                        circle.destination.right, circle.destination.bottom,
                        circle.borderWidth,
                        circle.fillColor.red, circle.fillColor.green,
                        circle.fillColor.blue, circle.fillColor.alpha,
                        circle.borderColor.red, circle.borderColor.green,
                        circle.borderColor.blue, circle.borderColor.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawDiagonalPattern(const DiagonalPatternCommand& pattern) {
    beginCommand(Opcode::drawDiagonalPattern, 12 * sizeof(float));
    for (float value : {pattern.destination.left, pattern.destination.top,
                        pattern.destination.right, pattern.destination.bottom,
                        pattern.stripeWidth, pattern.gap, pattern.offset,
                        pattern.backward ? 1.0F : 0.0F,
                        pattern.color.red, pattern.color.green,
                        pattern.color.blue, pattern.color.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawLinearGradient(const LinearGradientCommand& gradient) {
    beginCommand(Opcode::drawLinearGradient, 14 * sizeof(float));
    for (float value : {gradient.destination.left, gradient.destination.top,
                        gradient.destination.right, gradient.destination.bottom,
                        gradient.cornerRadius, static_cast<float>(gradient.direction),
                        gradient.startColor.red, gradient.startColor.green,
                        gradient.startColor.blue, gradient.startColor.alpha,
                        gradient.endColor.red, gradient.endColor.green,
                        gradient.endColor.blue, gradient.endColor.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawLinearGradientCircle(const LinearGradientCircleCommand& gradient) {
    beginCommand(Opcode::drawLinearGradientCircle, 13 * sizeof(float));
    for (float value : {gradient.destination.left, gradient.destination.top,
                        gradient.destination.right, gradient.destination.bottom,
                        static_cast<float>(gradient.direction),
                        gradient.startColor.red, gradient.startColor.green,
                        gradient.startColor.blue, gradient.startColor.alpha,
                        gradient.endColor.red, gradient.endColor.green,
                        gradient.endColor.blue, gradient.endColor.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawGridPattern(const GridPatternCommand& pattern) {
    beginCommand(Opcode::drawGridPattern, 19 * sizeof(float));
    for (float value : {pattern.destination.left, pattern.destination.top,
                        pattern.destination.right, pattern.destination.bottom,
                        pattern.spacing, pattern.minorWidth, pattern.majorWidth,
                        pattern.offsetX, pattern.offsetY, static_cast<float>(pattern.majorEvery),
                        pattern.cornerRadius,
                        pattern.minorColor.red, pattern.minorColor.green,
                        pattern.minorColor.blue, pattern.minorColor.alpha,
                        pattern.majorColor.red, pattern.majorColor.green,
                        pattern.majorColor.blue, pattern.majorColor.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawConicGradient(const ConicGradientCommand& gradient) {
    beginCommand(Opcode::drawConicGradient, 20 * sizeof(float));
    for (float value : {gradient.destination.left, gradient.destination.top,
                        gradient.destination.right, gradient.destination.bottom,
                        gradient.centerX, gradient.centerY, gradient.rotation,
                        gradient.cornerRadius,
                        gradient.startColor.red, gradient.startColor.green,
                        gradient.startColor.blue, gradient.startColor.alpha,
                        gradient.middleColor.red, gradient.middleColor.green,
                        gradient.middleColor.blue, gradient.middleColor.alpha,
                        gradient.endColor.red, gradient.endColor.green,
                        gradient.endColor.blue, gradient.endColor.alpha}) appendFloat(bytes_, value);
}

void CommandEncoder::drawDotGrid(const DotGridCommand& grid) {
    beginCommand(Opcode::drawDotGrid, 96);
    for (float value : {grid.destination.left, grid.destination.top,
                        grid.destination.right, grid.destination.bottom}) appendFloat(bytes_, value);
    appendU32(bytes_, grid.rows);
    appendU32(bytes_, grid.columns);
    appendU32(bytes_, grid.filledMask);
    appendU32(bytes_, static_cast<std::uint32_t>(grid.activeIndex));
    for (float value : {grid.inset, grid.radius, grid.borderWidth, 0.0F,
                        grid.fillColor.red, grid.fillColor.green,
                        grid.fillColor.blue, grid.fillColor.alpha,
                        grid.ringColor.red, grid.ringColor.green,
                        grid.ringColor.blue, grid.ringColor.alpha,
                        grid.highlightColor.red, grid.highlightColor.green,
                        grid.highlightColor.blue, grid.highlightColor.alpha}) appendFloat(bytes_, value);
}

void CommandEncoder::drawWaveDots(const WaveDotsCommand& wave) {
    beginCommand(Opcode::drawWaveDots, 128);
    for (float value : {wave.destination.left, wave.destination.top,
                        wave.destination.right, wave.destination.bottom}) appendFloat(bytes_, value);
    appendU32(bytes_, wave.count);
    appendU32(bytes_, 0);
    for (float value : {wave.inset, wave.minimumRadius, wave.maximumRadius, wave.phase,
                        wave.frequency, wave.borderWidth,
                        wave.troughStartColor.red, wave.troughStartColor.green,
                        wave.troughStartColor.blue, wave.troughStartColor.alpha,
                        wave.troughEndColor.red, wave.troughEndColor.green,
                        wave.troughEndColor.blue, wave.troughEndColor.alpha,
                        wave.crestStartColor.red, wave.crestStartColor.green,
                        wave.crestStartColor.blue, wave.crestStartColor.alpha,
                        wave.crestEndColor.red, wave.crestEndColor.green,
                        wave.crestEndColor.blue, wave.crestEndColor.alpha,
                        wave.borderColor.red, wave.borderColor.green,
                        wave.borderColor.blue, wave.borderColor.alpha}) appendFloat(bytes_, value);
}

void CommandEncoder::drawImage(const ImageCommand& image) {
    beginCommand(Opcode::drawImage, 56);
    appendU32(bytes_, image.textureId);
    appendU32(bytes_, 0);
    for (float value : {image.destination.left, image.destination.top,
                        image.destination.right, image.destination.bottom,
                        image.uv.left, image.uv.top, image.uv.right, image.uv.bottom,
                        image.tint.red, image.tint.green, image.tint.blue, image.tint.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawImageSurface(const ImageSurfaceCommand& image) {
    beginCommand(Opcode::drawImageSurface, 64);
    appendU32(bytes_, image.textureId);
    appendU32(bytes_, image.sampling == ImageSampling::nearest ? 1U : 0U);
    for (float value : {image.destination.left, image.destination.top,
                        image.destination.right, image.destination.bottom,
                        image.uv.left, image.uv.top, image.uv.right, image.uv.bottom,
                        image.tint.red, image.tint.green, image.tint.blue, image.tint.alpha,
                        image.cornerRadius, 0.0F}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawTiledImageSurface(const ImageSurfaceCommand& image) {
    beginCommand(Opcode::drawTiledImageSurface, 64);
    appendU32(bytes_, image.textureId);
    appendU32(bytes_, (image.sampling == ImageSampling::nearest ? 1U : 0U) |
                          (image.repeatX ? 2U : 0U) | (image.repeatY ? 4U : 0U));
    for (float value : {image.destination.left, image.destination.top,
                        image.destination.right, image.destination.bottom,
                        image.uv.left, image.uv.top, image.uv.right, image.uv.bottom,
                        image.tint.red, image.tint.green, image.tint.blue, image.tint.alpha,
                        image.cornerRadius, 0.0F}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawNineSliceImage(const NineSliceImageCommand& image) {
    beginCommand(Opcode::drawNineSliceImage, 96);
    appendU32(bytes_, image.textureId);
    appendU32(bytes_, image.sampling == ImageSampling::nearest ? 1U : 0U);
    for (float value : {image.destination.left, image.destination.top,
                        image.destination.right, image.destination.bottom,
                        image.uv.left, image.uv.top, image.uv.right, image.uv.bottom,
                        image.tint.red, image.tint.green, image.tint.blue, image.tint.alpha,
                        image.sourceInsets.left, image.sourceInsets.top,
                        image.sourceInsets.right, image.sourceInsets.bottom,
                        image.destinationInsets.left, image.destinationInsets.top,
                        image.destinationInsets.right, image.destinationInsets.bottom,
                        image.cornerRadius, 0.0F}) appendFloat(bytes_, value);
}

void CommandEncoder::drawMesh(const MeshCommand& mesh) {
    beginCommand(Opcode::drawMesh, 40);
    appendU32(bytes_, mesh.meshId);
    appendU32(bytes_, 0);
    for (float value : {mesh.destination.left, mesh.destination.top,
                        mesh.destination.right, mesh.destination.bottom,
                        mesh.viewBox.x, mesh.viewBox.y,
                        mesh.viewBox.width, mesh.viewBox.height}) appendFloat(bytes_, value);
}

void CommandEncoder::drawPath(const PathCommand& path) {
    const bool dashed = path.dashLength > 0.0F && path.gapLength > 0.0F;
    const bool extended = path.strokeGradient;
    const bool styled = path.miterLimit != 4.0F;
    const bool dashArray = !path.dashPattern.empty();
    const bool multiGradient = path.gradient.stops.size() > 2 ||
        path.strokeGradientPaint.stops.size() > 2 ||
        path.gradient.spread != PathGradient::Spread::pad ||
        path.strokeGradientPaint.spread != PathGradient::Spread::pad;
    const bool radialGradient = path.fillRadialGradient || path.strokeRadialGradient;
    const bool conicGradient = path.fillConicGradient || path.strokeConicGradient;
    const bool texturePaint = path.fillTexture || path.strokeTexture;
    const bool styledRadialGradient = radialGradient && (dashed || dashArray || styled);
    const bool twoCircleRadialGradient = radialGradient && path.radialGradient.hasFocalPoint &&
        path.radialGradient.focalRadius > 0.0F;
    const bool focalRadialGradient = radialGradient && path.radialGradient.hasFocalPoint &&
        !twoCircleRadialGradient;
    const bool multiRadialGradient = radialGradient && !focalRadialGradient &&
        (!path.radialGradient.stops.empty() ||
         path.radialGradient.spread != PathGradient::Spread::pad);
    const std::size_t radialStopCount =
        (styledRadialGradient || multiRadialGradient || focalRadialGradient ||
         twoCircleRadialGradient)
        ? (path.radialGradient.stops.empty() ? 2U : path.radialGradient.stops.size()) : 0U;
    const std::size_t multiDashCount = dashArray ? path.dashPattern.size() : dashed ? 2U : 0U;
    const std::size_t conicStopCount = conicGradient ? path.conicGradient.stops.size() : 0U;
    const std::uint32_t multiSize = static_cast<std::uint32_t>(192 + multiDashCount * 4 +
        (path.gradient.stops.size() + path.strokeGradientPaint.stops.size()) * 20);
    const std::uint32_t multiRadialSize = static_cast<std::uint32_t>(
        160 + radialStopCount * 20);
    const std::uint32_t focalRadialSize = static_cast<std::uint32_t>(
        168 + radialStopCount * 20);
    const std::uint32_t twoCircleRadialSize = static_cast<std::uint32_t>(
        176 + radialStopCount * 20);
    const std::uint32_t styledRadialSize = static_cast<std::uint32_t>(
        184 + multiDashCount * 4 + radialStopCount * 20);
    const std::uint32_t conicSize = static_cast<std::uint32_t>(
        152 + multiDashCount * 4 + conicStopCount * 20);
    const std::uint32_t textureSize = static_cast<std::uint32_t>(200 + multiDashCount * 4);
    beginCommand(texturePaint ? Opcode::drawTexturePath : conicGradient ? Opcode::drawConicPath : styledRadialGradient ? Opcode::drawStyledRadialPath : twoCircleRadialGradient ? Opcode::drawTwoCircleRadialPath : focalRadialGradient ? Opcode::drawFocalRadialPath : multiRadialGradient ? Opcode::drawMultiRadialPath : radialGradient ? Opcode::drawRadialPath : multiGradient ? Opcode::drawMultiGradientPath : dashArray ? Opcode::drawDashArrayPath : styled ? Opcode::drawStyledPath : extended ? Opcode::drawExtendedPath
                         : dashed ? Opcode::drawDashedPath : Opcode::drawPath,
                 texturePaint ? textureSize : conicGradient ? conicSize : styledRadialGradient ? styledRadialSize : twoCircleRadialGradient ? twoCircleRadialSize : focalRadialGradient ? focalRadialSize : multiRadialGradient ? multiRadialSize : radialGradient ? 184U : multiGradient ? multiSize : dashArray ? static_cast<std::uint32_t>(192 + path.dashPattern.size() * 4) :
                 styled ? 208 : extended ? (dashed ? 192 : 176) : dashed ? 144 : 128);
    appendU32(bytes_, path.pathId);
    bytes_.push_back(static_cast<std::uint8_t>((path.fill ? 1U : 0U) |
                                               (path.stroke ? 2U : 0U) |
                                               (path.fillGradient ? 4U : 0U) |
                                               (path.strokeGradient ? 8U : 0U) |
                                               (path.fillRadialGradient ? 16U : 0U) |
                                               (path.strokeRadialGradient ? 32U : 0U) |
                                               (path.fillConicGradient ? 64U : 0U) |
                                               (path.strokeConicGradient ? 128U : 0U)));
    bytes_.push_back(static_cast<std::uint8_t>(path.fillRule));
    bytes_.push_back(static_cast<std::uint8_t>(path.lineCap));
    bytes_.push_back(static_cast<std::uint8_t>(path.lineJoin));
    appendFloat(bytes_, path.strokeWidth);
    appendFloat(bytes_, path.tolerance);
    for (float value : {path.destination.left, path.destination.top,
                        path.destination.right, path.destination.bottom,
                        path.viewBox.x, path.viewBox.y,
                        path.viewBox.width, path.viewBox.height,
                        path.fillColor.red, path.fillColor.green,
                        path.fillColor.blue, path.fillColor.alpha,
                        path.strokeColor.red, path.strokeColor.green,
                        path.strokeColor.blue, path.strokeColor.alpha}) {
        appendFloat(bytes_, value);
    }
    for (float value : {path.gradient.startX, path.gradient.startY,
                        path.gradient.endX, path.gradient.endY,
                        path.gradient.startColor.red, path.gradient.startColor.green,
                        path.gradient.startColor.blue, path.gradient.startColor.alpha,
                        path.gradient.endColor.red, path.gradient.endColor.green,
                        path.gradient.endColor.blue, path.gradient.endColor.alpha}) {
        appendFloat(bytes_, value);
    }
    if (texturePaint) {
        appendU32(bytes_, path.texturePaint.textureId);
        bytes_.push_back(static_cast<std::uint8_t>(path.texturePaint.sampling));
        bytes_.push_back(path.texturePaint.repeatX ? 1U : 0U);
        bytes_.push_back(path.texturePaint.repeatY ? 1U : 0U);
        bytes_.push_back(path.strokeTexture ? 1U : 0U);
        for (float value : {path.texturePaint.sourceRect.x, path.texturePaint.sourceRect.y,
                            path.texturePaint.sourceRect.width, path.texturePaint.sourceRect.height,
                            path.texturePaint.uv.left, path.texturePaint.uv.top,
                            path.texturePaint.uv.right, path.texturePaint.uv.bottom,
                            path.texturePaint.tint.red, path.texturePaint.tint.green,
                            path.texturePaint.tint.blue, path.texturePaint.tint.alpha,
                            path.miterLimit, path.dashOffset}) appendFloat(bytes_, value);
        appendU16(bytes_, static_cast<std::uint16_t>(multiDashCount));
        appendU16(bytes_, 0);
        appendU32(bytes_, 0);
        if (dashArray) {
            for (float value : path.dashPattern) appendFloat(bytes_, value);
        } else if (dashed) {
            appendFloat(bytes_, path.dashLength);
            appendFloat(bytes_, path.gapLength);
        }
    } else if (conicGradient) {
        for (float value : {path.conicGradient.centerX, path.conicGradient.centerY,
                            path.conicGradient.rotation, path.miterLimit, path.dashOffset})
            appendFloat(bytes_, value);
        appendU16(bytes_, static_cast<std::uint16_t>(multiDashCount));
        bytes_.push_back(static_cast<std::uint8_t>(conicStopCount));
        bytes_.push_back(0);
        if (dashArray) {
            for (float value : path.dashPattern) appendFloat(bytes_, value);
        } else if (dashed) {
            appendFloat(bytes_, path.dashLength);
            appendFloat(bytes_, path.gapLength);
        }
        for (const PathGradient::Stop& stop : path.conicGradient.stops) {
            appendFloat(bytes_, stop.offset);
            for (float value : {stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha})
                appendFloat(bytes_, value);
        }
    } else if (styledRadialGradient) {
        for (float value : {path.radialGradient.centerX, path.radialGradient.centerY,
                            path.radialGradient.axisXX, path.radialGradient.axisXY,
                            path.radialGradient.axisYX, path.radialGradient.axisYY,
                            path.radialGradient.hasFocalPoint ? path.radialGradient.focalX
                                                             : path.radialGradient.centerX,
                            path.radialGradient.hasFocalPoint ? path.radialGradient.focalY
                                                             : path.radialGradient.centerY,
                            path.radialGradient.focalRadius, path.miterLimit, path.dashOffset})
            appendFloat(bytes_, value);
        appendU16(bytes_, static_cast<std::uint16_t>(multiDashCount));
        bytes_.push_back(static_cast<std::uint8_t>(radialStopCount));
        bytes_.push_back(static_cast<std::uint8_t>(path.radialGradient.spread));
        bytes_.push_back(static_cast<std::uint8_t>(twoCircleRadialGradient ? 2U :
            focalRadialGradient ? 1U : 0U));
        bytes_.insert(bytes_.end(), 7, 0);
        if (dashArray) {
            for (float value : path.dashPattern) appendFloat(bytes_, value);
        } else if (dashed) {
            appendFloat(bytes_, path.dashLength);
            appendFloat(bytes_, path.gapLength);
        }
        const auto appendStyledRadialStop = [&](const PathGradient::Stop& stop) {
            appendFloat(bytes_, stop.offset);
            for (float value : {stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha})
                appendFloat(bytes_, value);
        };
        if (path.radialGradient.stops.empty()) {
            appendStyledRadialStop({0.0F, path.radialGradient.innerColor});
            appendStyledRadialStop({1.0F, path.radialGradient.outerColor});
        } else {
            for (const PathGradient::Stop& stop : path.radialGradient.stops)
                appendStyledRadialStop(stop);
        }
    } else if (multiRadialGradient || focalRadialGradient || twoCircleRadialGradient) {
        for (float value : {path.radialGradient.centerX, path.radialGradient.centerY,
                            path.radialGradient.axisXX, path.radialGradient.axisXY,
                            path.radialGradient.axisYX, path.radialGradient.axisYY})
            appendFloat(bytes_, value);
        if (focalRadialGradient || twoCircleRadialGradient) {
            appendFloat(bytes_, path.radialGradient.focalX);
            appendFloat(bytes_, path.radialGradient.focalY);
        }
        if (twoCircleRadialGradient) {
            appendFloat(bytes_, path.radialGradient.focalRadius);
            appendFloat(bytes_, 0.0F);
        }
        bytes_.push_back(static_cast<std::uint8_t>(radialStopCount));
        bytes_.push_back(static_cast<std::uint8_t>(path.radialGradient.spread));
        bytes_.insert(bytes_.end(), 6, 0);
        const auto appendRadialStop = [&](const PathGradient::Stop& stop) {
            appendFloat(bytes_, stop.offset);
            for (float value : {stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha})
                appendFloat(bytes_, value);
        };
        if (path.radialGradient.stops.empty()) {
            appendRadialStop({0.0F, path.radialGradient.innerColor});
            appendRadialStop({1.0F, path.radialGradient.outerColor});
        } else {
            for (const PathGradient::Stop& stop : path.radialGradient.stops)
                appendRadialStop(stop);
        }
    } else if (radialGradient) {
        for (float value : {path.radialGradient.centerX, path.radialGradient.centerY,
                            path.radialGradient.axisXX, path.radialGradient.axisXY,
                            path.radialGradient.axisYX, path.radialGradient.axisYY,
                            path.radialGradient.innerColor.red, path.radialGradient.innerColor.green,
                            path.radialGradient.innerColor.blue, path.radialGradient.innerColor.alpha,
                            path.radialGradient.outerColor.red, path.radialGradient.outerColor.green,
                            path.radialGradient.outerColor.blue, path.radialGradient.outerColor.alpha})
            appendFloat(bytes_, value);
    } else if (extended || styled || dashArray || multiGradient) {
        for (float value : {path.strokeGradientPaint.startX, path.strokeGradientPaint.startY,
                            path.strokeGradientPaint.endX, path.strokeGradientPaint.endY,
                            path.strokeGradientPaint.startColor.red,
                            path.strokeGradientPaint.startColor.green,
                            path.strokeGradientPaint.startColor.blue,
                            path.strokeGradientPaint.startColor.alpha,
                            path.strokeGradientPaint.endColor.red,
                            path.strokeGradientPaint.endColor.green,
                            path.strokeGradientPaint.endColor.blue,
                            path.strokeGradientPaint.endColor.alpha}) appendFloat(bytes_, value);
    }
    if (radialGradient || conicGradient || texturePaint) {
        return;
    } else if (multiGradient) {
        appendFloat(bytes_, path.miterLimit);
        appendFloat(bytes_, path.dashOffset);
        appendU16(bytes_, static_cast<std::uint16_t>(multiDashCount));
        bytes_.push_back(static_cast<std::uint8_t>(path.gradient.stops.size()));
        bytes_.push_back(static_cast<std::uint8_t>(path.strokeGradientPaint.stops.size()));
        bytes_.push_back(static_cast<std::uint8_t>(path.gradient.spread));
        bytes_.push_back(static_cast<std::uint8_t>(path.strokeGradientPaint.spread));
        appendU16(bytes_, 0);
        if (dashArray) {
            for (float length : path.dashPattern) appendFloat(bytes_, length);
        } else if (dashed) {
            appendFloat(bytes_, path.dashLength);
            appendFloat(bytes_, path.gapLength);
        }
        const auto appendStops = [&](const std::vector<PathGradient::Stop>& stops) {
            for (const PathGradient::Stop& stop : stops) {
                appendFloat(bytes_, stop.offset);
                appendFloat(bytes_, stop.color.red);
                appendFloat(bytes_, stop.color.green);
                appendFloat(bytes_, stop.color.blue);
                appendFloat(bytes_, stop.color.alpha);
            }
        };
        appendStops(path.gradient.stops);
        appendStops(path.strokeGradientPaint.stops);
    } else if (dashArray) {
        appendFloat(bytes_, path.miterLimit);
        appendFloat(bytes_, path.dashOffset);
        appendU32(bytes_, static_cast<std::uint32_t>(path.dashPattern.size()));
        appendU32(bytes_, 0);
        for (float length : path.dashPattern) appendFloat(bytes_, length);
    } else if (dashed || styled) {
        appendFloat(bytes_, path.dashLength);
        appendFloat(bytes_, path.gapLength);
        appendFloat(bytes_, path.dashOffset);
        appendFloat(bytes_, 0.0F);
    }
    if (styled && !dashArray && !multiGradient) {
        appendFloat(bytes_, path.miterLimit);
        appendFloat(bytes_, 0.0F);
        appendFloat(bytes_, 0.0F);
        appendFloat(bytes_, 0.0F);
    }
}

void CommandEncoder::drawText(const TextCommand& text) {
    const std::uint8_t extension = text.anchor != TextAnchor::start ||
        text.baseline != TextBaseline::top ? 4 : text.fontResourceId != 0 ? 3
        : text.decoration != noTextDecoration ? 2
        : text.letterSpacing != 0.0F ? 1 : 0;
    const std::size_t headerSize = extension == 4 ? 48 : extension == 3 ? 44
        : extension == 2 ? 40 : extension == 1 ? 36 : 32;
    if (text.text.size() > std::numeric_limits<std::uint32_t>::max() - headerSize) {
        throw std::length_error("Text command exceeds 4 GiB");
    }
    beginCommand(Opcode::drawText,
                 static_cast<std::uint32_t>(headerSize + text.text.size()));
    bytes_.push_back(static_cast<std::uint8_t>(text.family));
    bytes_.push_back(static_cast<std::uint8_t>(text.weight));
    bytes_.push_back(static_cast<std::uint8_t>(text.style));
    bytes_.push_back(extension);
    for (float value : {text.left, text.top, text.fontSize,
                        text.color.red, text.color.green,
                        text.color.blue, text.color.alpha}) {
        appendFloat(bytes_, value);
    }
    if (extension >= 1) appendFloat(bytes_, text.letterSpacing);
    if (extension >= 2) {
        bytes_.push_back(text.decoration);
        bytes_.insert(bytes_.end(), 3, 0);
    }
    if (extension >= 3) appendU32(bytes_, text.fontResourceId);
    if (extension == 4) {
        bytes_.push_back(static_cast<std::uint8_t>(text.anchor));
        bytes_.push_back(static_cast<std::uint8_t>(text.baseline));
        bytes_.insert(bytes_.end(), 2, 0);
    }
    bytes_.insert(bytes_.end(), text.text.begin(), text.text.end());
}

void CommandEncoder::drawStyledText(const TextCommand& text) {
    constexpr std::size_t headerSize = 64;
    if (text.text.size() > std::numeric_limits<std::uint32_t>::max() - headerSize)
        throw std::length_error("Styled text command exceeds 4 GiB");
    beginCommand(Opcode::drawStyledText,
                 static_cast<std::uint32_t>(headerSize + text.text.size()));
    bytes_.push_back(static_cast<std::uint8_t>(text.family));
    bytes_.push_back(static_cast<std::uint8_t>(text.weight));
    bytes_.push_back(static_cast<std::uint8_t>(text.style));
    bytes_.push_back(text.decoration);
    for (float value : {text.left, text.top, text.fontSize, text.color.red, text.color.green,
                        text.color.blue, text.color.alpha, text.letterSpacing}) appendFloat(bytes_, value);
    appendU32(bytes_, text.fontResourceId);
    bytes_.push_back(static_cast<std::uint8_t>(text.anchor));
    bytes_.push_back(static_cast<std::uint8_t>(text.baseline));
    appendU16(bytes_, 0);
    for (float value : {text.strokeColor.red, text.strokeColor.green, text.strokeColor.blue,
                        text.strokeColor.alpha, text.strokeWidth}) appendFloat(bytes_, value);
    bytes_.insert(bytes_.end(), text.text.begin(), text.text.end());
}

void CommandEncoder::drawRichText(const RichTextCommand& text) {
    const bool placed = text.anchor != TextAnchor::start || text.baseline != TextBaseline::top;
    const bool scaledRuns = std::any_of(text.runs.begin(), text.runs.end(), [](const RichTextRun& run) {
        return run.fontScale != 1.0F;
    });
    const bool shiftedRuns = std::any_of(text.runs.begin(), text.runs.end(), [](const RichTextRun& run) {
        return run.baselineShift != 0.0F;
    });
    const bool styledRuns = std::any_of(text.runs.begin(), text.runs.end(), [](const RichTextRun& run) {
        return run.strokeWidth > 0.0F;
    });
    const std::size_t headerSize = placed ? 20 : 16;
    const std::size_t runHeaderSize = 32 + (scaledRuns ? 4 : 0) + (shiftedRuns ? 4 : 0) +
                                      (styledRuns ? 20 : 0);
    std::size_t payloadSize = headerSize;
    for (const RichTextRun& run : text.runs) {
        if (run.text.empty() || run.text.size() > 65536 ||
            !std::isfinite(run.fontScale) || run.fontScale <= 0.0F || run.fontScale > 16.0F ||
            !std::isfinite(run.baselineShift) || std::fabs(run.baselineShift) > 16.0F ||
            !std::isfinite(run.strokeWidth) || run.strokeWidth < 0.0F || run.strokeWidth > 4.0F ||
            payloadSize > std::numeric_limits<std::uint32_t>::max() - runHeaderSize - run.text.size()) {
            throw std::length_error("Rich text command is empty or too large");
        }
        payloadSize += runHeaderSize + run.text.size();
    }
    if (text.runs.empty() || text.runs.size() > 256) {
        throw std::length_error("Rich text requires 1 through 256 runs");
    }
    beginCommand(styledRuns ? Opcode::drawStyledRichText : Opcode::drawRichText,
                 static_cast<std::uint32_t>(payloadSize));
    appendFloat(bytes_, text.left); appendFloat(bytes_, text.top); appendFloat(bytes_, text.fontSize);
    appendU32(bytes_, static_cast<std::uint32_t>(text.runs.size()) |
                      (placed ? 0x80000000U : 0U) | (scaledRuns ? 0x40000000U : 0U) |
                      (shiftedRuns ? 0x20000000U : 0U));
    if (placed) {
        bytes_.push_back(static_cast<std::uint8_t>(text.anchor));
        bytes_.push_back(static_cast<std::uint8_t>(text.baseline));
        bytes_.insert(bytes_.end(), 2, 0);
    }
    for (const RichTextRun& run : text.runs) {
        bytes_.push_back(static_cast<std::uint8_t>(run.family));
        bytes_.push_back(static_cast<std::uint8_t>(run.weight));
        bytes_.push_back(static_cast<std::uint8_t>(run.style));
        bytes_.push_back(run.decoration);
        appendFloat(bytes_, run.letterSpacing);
        appendU32(bytes_, run.fontResourceId);
        for (float value : {run.color.red, run.color.green, run.color.blue, run.color.alpha}) {
            appendFloat(bytes_, value);
        }
        appendU32(bytes_, static_cast<std::uint32_t>(run.text.size()));
        if (scaledRuns) appendFloat(bytes_, run.fontScale);
        if (shiftedRuns) appendFloat(bytes_, run.baselineShift);
        if (styledRuns) {
            for (float value : {run.strokeColor.red, run.strokeColor.green, run.strokeColor.blue,
                                run.strokeColor.alpha, run.strokeWidth}) appendFloat(bytes_, value);
        }
        bytes_.insert(bytes_.end(), run.text.begin(), run.text.end());
    }
}

std::vector<std::uint8_t> CommandEncoder::finish() {
    if (bytes_.size() > std::numeric_limits<std::uint32_t>::max()) {
        throw std::length_error("Graphics command stream exceeds 4 GiB");
    }
    patchU32(bytes_, 8, static_cast<std::uint32_t>(bytes_.size()));
    patchU32(bytes_, 12, commandCount_);
    finished_ = true;
    return bytes_;
}

CommandDecoder::CommandDecoder(const std::vector<std::uint8_t>& bytes) : bytes_(bytes) {
    if (bytes.size() < streamHeaderSize) {
        error_ = "Command stream is smaller than its header";
        return;
    }
    if (std::memcmp(bytes.data(), "MGFX", 4) != 0) {
        error_ = "Command stream has an invalid magic value";
        return;
    }
    if (readU16(bytes.data() + 4) != protocolVersion) {
        error_ = "Unsupported graphics protocol version";
        return;
    }
    if (readU32(bytes.data() + 8) != bytes.size()) {
        error_ = "Command stream byte count does not match its header";
        return;
    }

    commandsRemaining_ = readU32(bytes.data() + 12);
    offset_ = streamHeaderSize;
}

bool CommandDecoder::next(CommandView& command) {
    if (!valid() || commandsRemaining_ == 0) {
        if (valid() && commandsRemaining_ == 0 && offset_ != bytes_.size()) {
            error_ = "Command stream has trailing bytes";
        }
        return false;
    }
    if (offset_ > bytes_.size() || bytes_.size() - offset_ < commandHeaderSize) {
        error_ = "Truncated command header";
        return false;
    }

    const auto* header = bytes_.data() + offset_;
    const std::uint32_t payloadSize = readU32(header + 4);
    offset_ += commandHeaderSize;
    if (payloadSize > bytes_.size() - offset_) {
        error_ = "Truncated command payload";
        return false;
    }

    command = {static_cast<Opcode>(readU16(header)), bytes_.data() + offset_, payloadSize};
    offset_ += payloadSize;
    --commandsRemaining_;
    return true;
}

bool decodeClear(const CommandView& command, Color& color) {
    if (command.opcode != Opcode::clear || command.payloadSize != 16) {
        return false;
    }
    color = {readFloat(command.payload),
             readFloat(command.payload + 4),
             readFloat(command.payload + 8),
             readFloat(command.payload + 12)};
    return true;
}

bool decodeDraw(const CommandView& command, DrawCommand& draw) {
    if (command.opcode != Opcode::draw || command.payloadSize < 8) {
        return false;
    }

    const std::uint32_t vertexCount = readU32(command.payload + 4);
    if (vertexCount > (std::numeric_limits<std::uint32_t>::max() - 8) / vertexWireSize ||
        command.payloadSize != 8 + vertexCount * vertexWireSize) {
        return false;
    }

    draw.primitive = static_cast<Primitive>(command.payload[0]);
    draw.vertices.resize(vertexCount);
    const std::uint8_t* source = command.payload + 8;
    for (Vertex& vertex : draw.vertices) {
        vertex.position = {readFloat(source), readFloat(source + 4)};
        for (std::size_t component = 0; component < vertex.color.size(); ++component) {
            vertex.color[component] = readFloat(source + 8 + component * 4);
        }
        source += vertexWireSize;
    }
    return true;
}

bool decodePushClip(const CommandView& command, ClipRect& clip) {
    if (command.opcode != Opcode::pushClip || command.payloadSize != 16) return false;
    clip = {readFloat(command.payload), readFloat(command.payload + 4),
            readFloat(command.payload + 8), readFloat(command.payload + 12)};
    return true;
}

bool decodePushTransform(const CommandView& command, AffineTransform& transform) {
    if (command.opcode != Opcode::pushTransform || command.payloadSize != 24) return false;
    transform = {readFloat(command.payload), readFloat(command.payload + 4),
                 readFloat(command.payload + 8), readFloat(command.payload + 12),
                 readFloat(command.payload + 16), readFloat(command.payload + 20)};
    return true;
}

bool decodePushOpacity(const CommandView& command, float& opacity) {
    if (command.opcode != Opcode::pushOpacity || command.payloadSize != 4) return false;
    opacity = readFloat(command.payload);
    return true;
}

bool decodeShadow(const CommandView& command, ShadowCommand& shadow) {
    if (command.opcode != Opcode::drawShadow || command.payloadSize != 44) return false;
    shadow.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                          readFloat(command.payload + 8), readFloat(command.payload + 12)};
    shadow.cornerRadius = readFloat(command.payload + 16);
    shadow.blur = readFloat(command.payload + 20);
    shadow.spread = readFloat(command.payload + 24);
    shadow.color = {readFloat(command.payload + 28), readFloat(command.payload + 32),
                    readFloat(command.payload + 36), readFloat(command.payload + 40)};
    return true;
}

bool decodeRadialGradient(const CommandView& command, RadialGradientCommand& gradient) {
    if (command.opcode != Opcode::drawRadialGradient || command.payloadSize != 64) return false;
    gradient.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                            readFloat(command.payload + 8), readFloat(command.payload + 12)};
    gradient.centerX = readFloat(command.payload + 16);
    gradient.centerY = readFloat(command.payload + 20);
    gradient.radius = readFloat(command.payload + 24);
    gradient.cornerRadius = readFloat(command.payload + 28);
    gradient.innerColor = {readFloat(command.payload + 32), readFloat(command.payload + 36),
                           readFloat(command.payload + 40), readFloat(command.payload + 44)};
    gradient.outerColor = {readFloat(command.payload + 48), readFloat(command.payload + 52),
                           readFloat(command.payload + 56), readFloat(command.payload + 60)};
    return true;
}

bool decodeRoundedRect(const CommandView& command, RoundedRectCommand& rectangle) {
    if (command.opcode != Opcode::drawRoundedRect || command.payloadSize != 56) return false;
    rectangle.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                             readFloat(command.payload + 8), readFloat(command.payload + 12)};
    rectangle.cornerRadius = readFloat(command.payload + 16);
    rectangle.borderWidth = readFloat(command.payload + 20);
    rectangle.fillColor = {readFloat(command.payload + 24), readFloat(command.payload + 28),
                           readFloat(command.payload + 32), readFloat(command.payload + 36)};
    rectangle.borderColor = {readFloat(command.payload + 40), readFloat(command.payload + 44),
                             readFloat(command.payload + 48), readFloat(command.payload + 52)};
    return true;
}

bool decodeCircle(const CommandView& command, CircleCommand& circle) {
    if (command.opcode != Opcode::drawCircle || command.payloadSize != 52) return false;
    circle.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                          readFloat(command.payload + 8), readFloat(command.payload + 12)};
    circle.borderWidth = readFloat(command.payload + 16);
    circle.fillColor = {readFloat(command.payload + 20), readFloat(command.payload + 24),
                        readFloat(command.payload + 28), readFloat(command.payload + 32)};
    circle.borderColor = {readFloat(command.payload + 36), readFloat(command.payload + 40),
                          readFloat(command.payload + 44), readFloat(command.payload + 48)};
    return true;
}

bool decodeDiagonalPattern(const CommandView& command, DiagonalPatternCommand& pattern) {
    if (command.opcode != Opcode::drawDiagonalPattern || command.payloadSize != 48) return false;
    pattern.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                           readFloat(command.payload + 8), readFloat(command.payload + 12)};
    pattern.stripeWidth = readFloat(command.payload + 16);
    pattern.gap = readFloat(command.payload + 20);
    pattern.offset = readFloat(command.payload + 24);
    const float direction = readFloat(command.payload + 28);
    if (direction != 0.0F && direction != 1.0F) return false;
    pattern.backward = direction == 1.0F;
    pattern.color = {readFloat(command.payload + 32), readFloat(command.payload + 36),
                     readFloat(command.payload + 40), readFloat(command.payload + 44)};
    return true;
}

bool decodeLinearGradient(const CommandView& command, LinearGradientCommand& gradient) {
    if (command.opcode != Opcode::drawLinearGradient || command.payloadSize != 56) return false;
    gradient.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                            readFloat(command.payload + 8), readFloat(command.payload + 12)};
    gradient.cornerRadius = readFloat(command.payload + 16);
    const float direction = readFloat(command.payload + 20);
    if (direction < 0.0F || direction > 2.0F || std::floor(direction) != direction) return false;
    gradient.direction = static_cast<GradientDirection>(static_cast<std::uint8_t>(direction));
    gradient.startColor = {readFloat(command.payload + 24), readFloat(command.payload + 28),
                           readFloat(command.payload + 32), readFloat(command.payload + 36)};
    gradient.endColor = {readFloat(command.payload + 40), readFloat(command.payload + 44),
                         readFloat(command.payload + 48), readFloat(command.payload + 52)};
    return true;
}

bool decodeLinearGradientCircle(const CommandView& command,
                                LinearGradientCircleCommand& gradient) {
    if (command.opcode != Opcode::drawLinearGradientCircle || command.payloadSize != 52) return false;
    gradient.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                            readFloat(command.payload + 8), readFloat(command.payload + 12)};
    const float direction = readFloat(command.payload + 16);
    if (direction < 0.0F || direction > 2.0F || std::floor(direction) != direction) return false;
    gradient.direction = static_cast<GradientDirection>(static_cast<std::uint8_t>(direction));
    gradient.startColor = {readFloat(command.payload + 20), readFloat(command.payload + 24),
                           readFloat(command.payload + 28), readFloat(command.payload + 32)};
    gradient.endColor = {readFloat(command.payload + 36), readFloat(command.payload + 40),
                         readFloat(command.payload + 44), readFloat(command.payload + 48)};
    return true;
}

bool decodeGridPattern(const CommandView& command, GridPatternCommand& pattern) {
    if (command.opcode != Opcode::drawGridPattern || command.payloadSize != 76) return false;
    pattern.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                           readFloat(command.payload + 8), readFloat(command.payload + 12)};
    pattern.spacing = readFloat(command.payload + 16);
    pattern.minorWidth = readFloat(command.payload + 20);
    pattern.majorWidth = readFloat(command.payload + 24);
    pattern.offsetX = readFloat(command.payload + 28);
    pattern.offsetY = readFloat(command.payload + 32);
    const float majorEvery = readFloat(command.payload + 36);
    if (majorEvery < 1.0F || majorEvery > 256.0F || std::floor(majorEvery) != majorEvery) return false;
    pattern.majorEvery = static_cast<std::uint32_t>(majorEvery);
    pattern.cornerRadius = readFloat(command.payload + 40);
    pattern.minorColor = {readFloat(command.payload + 44), readFloat(command.payload + 48),
                          readFloat(command.payload + 52), readFloat(command.payload + 56)};
    pattern.majorColor = {readFloat(command.payload + 60), readFloat(command.payload + 64),
                          readFloat(command.payload + 68), readFloat(command.payload + 72)};
    return true;
}

bool decodeConicGradient(const CommandView& command, ConicGradientCommand& gradient) {
    if (command.opcode != Opcode::drawConicGradient || command.payloadSize != 80) return false;
    gradient.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                            readFloat(command.payload + 8), readFloat(command.payload + 12)};
    gradient.centerX = readFloat(command.payload + 16);
    gradient.centerY = readFloat(command.payload + 20);
    gradient.rotation = readFloat(command.payload + 24);
    gradient.cornerRadius = readFloat(command.payload + 28);
    gradient.startColor = {readFloat(command.payload + 32), readFloat(command.payload + 36),
                           readFloat(command.payload + 40), readFloat(command.payload + 44)};
    gradient.middleColor = {readFloat(command.payload + 48), readFloat(command.payload + 52),
                            readFloat(command.payload + 56), readFloat(command.payload + 60)};
    gradient.endColor = {readFloat(command.payload + 64), readFloat(command.payload + 68),
                         readFloat(command.payload + 72), readFloat(command.payload + 76)};
    return true;
}

bool decodeDotGrid(const CommandView& command, DotGridCommand& grid) {
    if (command.opcode != Opcode::drawDotGrid || command.payloadSize != 96 ||
        readFloat(command.payload + 44) != 0.0F) return false;
    grid.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                        readFloat(command.payload + 8), readFloat(command.payload + 12)};
    grid.rows = readU32(command.payload + 16);
    grid.columns = readU32(command.payload + 20);
    grid.filledMask = readU32(command.payload + 24);
    grid.activeIndex = static_cast<std::int32_t>(readU32(command.payload + 28));
    grid.inset = readFloat(command.payload + 32);
    grid.radius = readFloat(command.payload + 36);
    grid.borderWidth = readFloat(command.payload + 40);
    grid.fillColor = {readFloat(command.payload + 48), readFloat(command.payload + 52),
                      readFloat(command.payload + 56), readFloat(command.payload + 60)};
    grid.ringColor = {readFloat(command.payload + 64), readFloat(command.payload + 68),
                      readFloat(command.payload + 72), readFloat(command.payload + 76)};
    grid.highlightColor = {readFloat(command.payload + 80), readFloat(command.payload + 84),
                           readFloat(command.payload + 88), readFloat(command.payload + 92)};
    return true;
}

bool decodeWaveDots(const CommandView& command, WaveDotsCommand& wave) {
    if (command.opcode != Opcode::drawWaveDots || command.payloadSize != 128 ||
        readU32(command.payload + 20) != 0U) return false;
    wave.destination = {readFloat(command.payload), readFloat(command.payload + 4),
                        readFloat(command.payload + 8), readFloat(command.payload + 12)};
    wave.count = readU32(command.payload + 16);
    wave.inset = readFloat(command.payload + 24);
    wave.minimumRadius = readFloat(command.payload + 28);
    wave.maximumRadius = readFloat(command.payload + 32);
    wave.phase = readFloat(command.payload + 36);
    wave.frequency = readFloat(command.payload + 40);
    wave.borderWidth = readFloat(command.payload + 44);
    wave.troughStartColor = {readFloat(command.payload + 48), readFloat(command.payload + 52),
                             readFloat(command.payload + 56), readFloat(command.payload + 60)};
    wave.troughEndColor = {readFloat(command.payload + 64), readFloat(command.payload + 68),
                           readFloat(command.payload + 72), readFloat(command.payload + 76)};
    wave.crestStartColor = {readFloat(command.payload + 80), readFloat(command.payload + 84),
                            readFloat(command.payload + 88), readFloat(command.payload + 92)};
    wave.crestEndColor = {readFloat(command.payload + 96), readFloat(command.payload + 100),
                          readFloat(command.payload + 104), readFloat(command.payload + 108)};
    wave.borderColor = {readFloat(command.payload + 112), readFloat(command.payload + 116),
                        readFloat(command.payload + 120), readFloat(command.payload + 124)};
    return true;
}

bool decodeImage(const CommandView& command, ImageCommand& image) {
    if (command.opcode != Opcode::drawImage || command.payloadSize != 56 ||
        readU32(command.payload + 4) != 0) return false;
    image.textureId = readU32(command.payload);
    image.destination = {readFloat(command.payload + 8), readFloat(command.payload + 12),
                         readFloat(command.payload + 16), readFloat(command.payload + 20)};
    image.uv = {readFloat(command.payload + 24), readFloat(command.payload + 28),
                readFloat(command.payload + 32), readFloat(command.payload + 36)};
    image.tint = {readFloat(command.payload + 40), readFloat(command.payload + 44),
                  readFloat(command.payload + 48), readFloat(command.payload + 52)};
    return image.textureId != 0;
}

bool decodeImageSurface(const CommandView& command, ImageSurfaceCommand& image) {
    if (command.opcode != Opcode::drawImageSurface || command.payloadSize != 64 ||
        readU32(command.payload + 4) > 1U || readFloat(command.payload + 60) != 0.0F) return false;
    image.textureId = readU32(command.payload);
    image.sampling = readU32(command.payload + 4) == 1U
        ? ImageSampling::nearest : ImageSampling::linear;
    image.repeatX = false;
    image.repeatY = false;
    image.destination = {readFloat(command.payload + 8), readFloat(command.payload + 12),
                         readFloat(command.payload + 16), readFloat(command.payload + 20)};
    image.uv = {readFloat(command.payload + 24), readFloat(command.payload + 28),
                readFloat(command.payload + 32), readFloat(command.payload + 36)};
    image.tint = {readFloat(command.payload + 40), readFloat(command.payload + 44),
                  readFloat(command.payload + 48), readFloat(command.payload + 52)};
    image.cornerRadius = readFloat(command.payload + 56);
    return image.textureId != 0;
}

bool decodeTiledImageSurface(const CommandView& command, ImageSurfaceCommand& image) {
    if (command.opcode != Opcode::drawTiledImageSurface || command.payloadSize != 64) return false;
    const std::uint32_t flags = readU32(command.payload + 4);
    if (flags > 7U || readFloat(command.payload + 60) != 0.0F) return false;
    image.textureId = readU32(command.payload);
    image.sampling = (flags & 1U) != 0U ? ImageSampling::nearest : ImageSampling::linear;
    image.repeatX = (flags & 2U) != 0U;
    image.repeatY = (flags & 4U) != 0U;
    image.destination = {readFloat(command.payload + 8), readFloat(command.payload + 12),
                         readFloat(command.payload + 16), readFloat(command.payload + 20)};
    image.uv = {readFloat(command.payload + 24), readFloat(command.payload + 28),
                readFloat(command.payload + 32), readFloat(command.payload + 36)};
    image.tint = {readFloat(command.payload + 40), readFloat(command.payload + 44),
                  readFloat(command.payload + 48), readFloat(command.payload + 52)};
    image.cornerRadius = readFloat(command.payload + 56);
    return image.textureId != 0 && (image.repeatX || image.repeatY);
}

bool decodeNineSliceImage(const CommandView& command, NineSliceImageCommand& image) {
    if (command.opcode != Opcode::drawNineSliceImage || command.payloadSize != 96 ||
        readU32(command.payload + 4) > 1U || readFloat(command.payload + 92) != 0.0F) return false;
    image.textureId = readU32(command.payload);
    image.sampling = readU32(command.payload + 4) == 1U
        ? ImageSampling::nearest : ImageSampling::linear;
    image.destination = {readFloat(command.payload + 8), readFloat(command.payload + 12),
        readFloat(command.payload + 16), readFloat(command.payload + 20)};
    image.uv = {readFloat(command.payload + 24), readFloat(command.payload + 28),
        readFloat(command.payload + 32), readFloat(command.payload + 36)};
    image.tint = {readFloat(command.payload + 40), readFloat(command.payload + 44),
        readFloat(command.payload + 48), readFloat(command.payload + 52)};
    image.sourceInsets = {readFloat(command.payload + 56), readFloat(command.payload + 60),
        readFloat(command.payload + 64), readFloat(command.payload + 68)};
    image.destinationInsets = {readFloat(command.payload + 72), readFloat(command.payload + 76),
        readFloat(command.payload + 80), readFloat(command.payload + 84)};
    image.cornerRadius = readFloat(command.payload + 88);
    return image.textureId != 0;
}

bool decodeMesh(const CommandView& command, MeshCommand& mesh) {
    if (command.opcode != Opcode::drawMesh || command.payloadSize != 40 ||
        readU32(command.payload + 4) != 0U) return false;
    mesh.meshId = readU32(command.payload);
    mesh.destination = {readFloat(command.payload + 8), readFloat(command.payload + 12),
                        readFloat(command.payload + 16), readFloat(command.payload + 20)};
    mesh.viewBox = {readFloat(command.payload + 24), readFloat(command.payload + 28),
                    readFloat(command.payload + 32), readFloat(command.payload + 36)};
    return mesh.meshId != 0;
}

bool decodePath(const CommandView& command, PathCommand& path) {
    const bool dashed = command.opcode == Opcode::drawDashedPath;
    const bool extended = command.opcode == Opcode::drawExtendedPath;
    const bool styled = command.opcode == Opcode::drawStyledPath;
    const bool dashArray = command.opcode == Opcode::drawDashArrayPath;
    const bool multiGradient = command.opcode == Opcode::drawMultiGradientPath;
    const bool radialGradient = command.opcode == Opcode::drawRadialPath;
    const bool multiRadialGradient = command.opcode == Opcode::drawMultiRadialPath;
    const bool focalRadialGradient = command.opcode == Opcode::drawFocalRadialPath;
    const bool twoCircleRadialGradient = command.opcode == Opcode::drawTwoCircleRadialPath;
    const bool styledRadialGradient = command.opcode == Opcode::drawStyledRadialPath;
    const bool conicGradient = command.opcode == Opcode::drawConicPath;
    const bool texturePaint = command.opcode == Opcode::drawTexturePath;
    const bool anyRadialGradient = radialGradient || multiRadialGradient ||
        focalRadialGradient || twoCircleRadialGradient || styledRadialGradient;
    const bool extendedDashed = extended && command.payloadSize == 192U;
    const bool validDashArraySize = dashArray && command.payloadSize >= 200U &&
        command.payloadSize <= 320U && readU32(command.payload + 184) >= 2U &&
        readU32(command.payload + 184) <= 32U && readU32(command.payload + 184) % 2U == 0U &&
        command.payloadSize == 192U + readU32(command.payload + 184) * 4U;
    const std::uint16_t multiDashCount = multiGradient && command.payloadSize >= 192U
        ? readU16(command.payload + 184) : 0U;
    const std::uint8_t fillStopCount = multiGradient && command.payloadSize >= 192U
        ? command.payload[186] : 0U;
    const std::uint8_t strokeStopCount = multiGradient && command.payloadSize >= 192U
        ? command.payload[187] : 0U;
    const auto validStopCount = [](std::uint8_t count) {
        return count == 0U || (count >= 2U && count <= 8U);
    };
    const std::uint8_t fillSpread = multiGradient && command.payloadSize >= 192U
        ? command.payload[188] : 0U;
    const std::uint8_t strokeSpread = multiGradient && command.payloadSize >= 192U
        ? command.payload[189] : 0U;
    const bool validMultiSize = multiGradient && command.payloadSize >= 192U &&
        multiDashCount <= 32U && (multiDashCount == 0U || multiDashCount % 2U == 0U) &&
        validStopCount(fillStopCount) && validStopCount(strokeStopCount) &&
        (fillStopCount > 2U || strokeStopCount > 2U || fillSpread != 0U || strokeSpread != 0U) &&
        fillSpread <= 2U && strokeSpread <= 2U && readU16(command.payload + 190) == 0U &&
        command.payloadSize == 192U + multiDashCount * 4U +
            (fillStopCount + strokeStopCount) * 20U;
    const std::uint16_t styledRadialDashCount = styledRadialGradient &&
        command.payloadSize >= 184U ? readU16(command.payload + 172) : 0U;
    const std::uint8_t styledRadialStopCount = styledRadialGradient &&
        command.payloadSize >= 184U ? command.payload[174] : 0U;
    const std::size_t radialHeaderOffset = styledRadialGradient ? 174U :
        twoCircleRadialGradient ? 168U :
        focalRadialGradient ? 160U : 152U;
    const std::size_t radialStopsOffset = styledRadialGradient
        ? 184U + styledRadialDashCount * 4U : twoCircleRadialGradient ? 176U :
        focalRadialGradient ? 168U : 160U;
    const std::uint8_t radialStopCount = styledRadialGradient ? styledRadialStopCount :
        (multiRadialGradient || focalRadialGradient || twoCircleRadialGradient) &&
        command.payloadSize >= radialStopsOffset ? command.payload[radialHeaderOffset] : 0U;
    const bool validMultiRadialSize = multiRadialGradient && radialStopCount >= 2U &&
        radialStopCount <= 8U && command.payloadSize == 160U + radialStopCount * 20U &&
        command.payload[153] <= 2U && readU16(command.payload + 154) == 0U &&
        readU32(command.payload + 156) == 0U;
    const bool validFocalRadialSize = focalRadialGradient && radialStopCount >= 2U &&
        radialStopCount <= 8U && command.payloadSize == 168U + radialStopCount * 20U &&
        command.payload[161] <= 2U && readU16(command.payload + 162) == 0U &&
        readU32(command.payload + 164) == 0U;
    const bool validTwoCircleRadialSize = twoCircleRadialGradient && radialStopCount >= 2U &&
        radialStopCount <= 8U && command.payloadSize == 176U + radialStopCount * 20U &&
        command.payload[169] <= 2U && readU32(command.payload + 164) == 0U &&
        readU16(command.payload + 170) == 0U && readU32(command.payload + 172) == 0U;
    const bool validStyledRadialSize = styledRadialGradient && radialStopCount >= 2U &&
        radialStopCount <= 8U && styledRadialDashCount <= 32U &&
        (styledRadialDashCount == 0U || (styledRadialDashCount >= 2U &&
         styledRadialDashCount % 2U == 0U)) && command.payload[175] <= 2U &&
        command.payload[176] <= 2U && command.payload[177] == 0U &&
        readU16(command.payload + 178) == 0U && readU32(command.payload + 180) == 0U &&
        command.payloadSize == 184U + styledRadialDashCount * 4U + radialStopCount * 20U;
    const std::uint16_t conicDashCount = conicGradient && command.payloadSize >= 152U
        ? readU16(command.payload + 148) : 0U;
    const std::uint8_t conicStopCount = conicGradient && command.payloadSize >= 152U
        ? command.payload[150] : 0U;
    const bool validConicSize = conicGradient && conicStopCount >= 2U &&
        conicStopCount <= 8U && conicDashCount <= 32U &&
        (conicDashCount == 0U || (conicDashCount >= 2U && conicDashCount % 2U == 0U)) &&
        command.payload[151] == 0U &&
        command.payloadSize == 152U + conicDashCount * 4U + conicStopCount * 20U;
    const std::uint16_t textureDashCount = texturePaint && command.payloadSize >= 200U
        ? readU16(command.payload + 192) : 0U;
    const bool validTextureSize = texturePaint && textureDashCount <= 32U &&
        (textureDashCount == 0U || (textureDashCount >= 2U && textureDashCount % 2U == 0U)) &&
        command.payload[132] <= 1U && command.payload[133] <= 1U &&
        command.payload[134] <= 1U && command.payload[135] <= 1U &&
        readU16(command.payload + 194) == 0U && readU32(command.payload + 196) == 0U &&
        command.payloadSize == 200U + textureDashCount * 4U;
    if ((!dashed && !extended && !styled && !dashArray && !multiGradient &&
         !anyRadialGradient && !conicGradient && !texturePaint &&
         command.opcode != Opcode::drawPath) ||
        (!dashArray && !multiGradient && !anyRadialGradient && !conicGradient && !texturePaint &&
         command.payloadSize != (styled ? 208U : extended ? (extendedDashed ? 192U : 176U)
                                                        : dashed ? 144U : 128U)) ||
        (dashArray && !validDashArraySize) ||
        (multiGradient && !validMultiSize) ||
        (radialGradient && command.payloadSize != 184U) ||
        (multiRadialGradient && !validMultiRadialSize) ||
        (focalRadialGradient && !validFocalRadialSize) ||
        (twoCircleRadialGradient && !validTwoCircleRadialSize) ||
        (styledRadialGradient && !validStyledRadialSize) ||
        (conicGradient && !validConicSize) ||
        (texturePaint && !validTextureSize) ||
        command.payload[4] > (conicGradient ? 255U : anyRadialGradient ? 63U :
                              texturePaint ? 3U : 15U) ||
        command.payload[5] > static_cast<std::uint8_t>(FillRule::evenodd) ||
        command.payload[6] > static_cast<std::uint8_t>(LineCap::square) ||
        command.payload[7] > static_cast<std::uint8_t>(LineJoin::miter)) return false;
    path.pathId = readU32(command.payload);
    path.fill = (command.payload[4] & 1U) != 0;
    path.stroke = (command.payload[4] & 2U) != 0;
    path.fillGradient = (command.payload[4] & 4U) != 0;
    path.strokeGradient = (command.payload[4] & 8U) != 0;
    path.fillRadialGradient = (command.payload[4] & 16U) != 0;
    path.strokeRadialGradient = (command.payload[4] & 32U) != 0;
    path.fillConicGradient = (command.payload[4] & 64U) != 0;
    path.strokeConicGradient = (command.payload[4] & 128U) != 0;
    path.fillRule = static_cast<FillRule>(command.payload[5]);
    path.lineCap = static_cast<LineCap>(command.payload[6]);
    path.lineJoin = static_cast<LineJoin>(command.payload[7]);
    path.strokeWidth = readFloat(command.payload + 8);
    path.tolerance = readFloat(command.payload + 12);
    path.destination = {readFloat(command.payload + 16), readFloat(command.payload + 20),
                        readFloat(command.payload + 24), readFloat(command.payload + 28)};
    path.viewBox = {readFloat(command.payload + 32), readFloat(command.payload + 36),
                    readFloat(command.payload + 40), readFloat(command.payload + 44)};
    path.fillColor = {readFloat(command.payload + 48), readFloat(command.payload + 52),
                      readFloat(command.payload + 56), readFloat(command.payload + 60)};
    path.strokeColor = {readFloat(command.payload + 64), readFloat(command.payload + 68),
                        readFloat(command.payload + 72), readFloat(command.payload + 76)};
    path.gradient = {readFloat(command.payload + 80), readFloat(command.payload + 84),
                     readFloat(command.payload + 88), readFloat(command.payload + 92),
                     {readFloat(command.payload + 96), readFloat(command.payload + 100),
                      readFloat(command.payload + 104), readFloat(command.payload + 108)},
                     {readFloat(command.payload + 112), readFloat(command.payload + 116),
                      readFloat(command.payload + 120), readFloat(command.payload + 124)}, {},
                     PathGradient::Spread::pad};
    if (extended || styled || dashArray || multiGradient) {
        path.strokeGradientPaint = {readFloat(command.payload + 128), readFloat(command.payload + 132),
            readFloat(command.payload + 136), readFloat(command.payload + 140),
            {readFloat(command.payload + 144), readFloat(command.payload + 148),
             readFloat(command.payload + 152), readFloat(command.payload + 156)},
            {readFloat(command.payload + 160), readFloat(command.payload + 164),
             readFloat(command.payload + 168), readFloat(command.payload + 172)}, {},
            PathGradient::Spread::pad};
    }
    if (anyRadialGradient) {
        path.radialGradient = {readFloat(command.payload + 128), readFloat(command.payload + 132),
            readFloat(command.payload + 136), readFloat(command.payload + 140),
            readFloat(command.payload + 144), readFloat(command.payload + 148), {}, {}, {},
            PathGradient::Spread::pad};
        if (radialGradient) {
            path.radialGradient.innerColor = {readFloat(command.payload + 152),
                readFloat(command.payload + 156), readFloat(command.payload + 160),
                readFloat(command.payload + 164)};
            path.radialGradient.outerColor = {readFloat(command.payload + 168),
                readFloat(command.payload + 172), readFloat(command.payload + 176),
                readFloat(command.payload + 180)};
        } else {
            path.radialGradient.spread = static_cast<PathGradient::Spread>(
                command.payload[radialHeaderOffset + 1U]);
            const std::uint8_t radialMode = styledRadialGradient ? command.payload[176] :
                twoCircleRadialGradient ? 2U : focalRadialGradient ? 1U : 0U;
            if (radialMode >= 1U) {
                path.radialGradient.hasFocalPoint = true;
                path.radialGradient.focalX = readFloat(command.payload + 152);
                path.radialGradient.focalY = readFloat(command.payload + 156);
            }
            if (radialMode == 2U) {
                path.radialGradient.focalRadius = readFloat(command.payload + 160);
                if (!std::isfinite(path.radialGradient.focalRadius) ||
                    path.radialGradient.focalRadius <= 0.0F ||
                    path.radialGradient.focalRadius >= 1.0F) return false;
            }
            if (styledRadialGradient) {
                path.miterLimit = readFloat(command.payload + 164);
                path.dashOffset = readFloat(command.payload + 168);
                if (!std::isfinite(path.miterLimit) || path.miterLimit < 1.0F ||
                    path.miterLimit > 1000.0F || !std::isfinite(path.dashOffset)) return false;
                path.dashPattern.reserve(styledRadialDashCount);
                for (std::uint16_t index = 0; index < styledRadialDashCount; ++index) {
                    const float length = readFloat(command.payload + 184U + index * 4U);
                    if (!std::isfinite(length) || length <= 0.0F) return false;
                    path.dashPattern.push_back(length);
                }
            }
            float previous = -1.0F;
            for (std::uint8_t index = 0; index < radialStopCount; ++index) {
                const std::size_t offset = radialStopsOffset + index * 20U;
                PathGradient::Stop stop{readFloat(command.payload + offset),
                    {readFloat(command.payload + offset + 4),
                     readFloat(command.payload + offset + 8),
                     readFloat(command.payload + offset + 12),
                     readFloat(command.payload + offset + 16)}};
                if (!std::isfinite(stop.offset) || stop.offset < previous ||
                    stop.offset < 0.0F || stop.offset > 1.0F) return false;
                previous = stop.offset;
                path.radialGradient.stops.push_back(stop);
            }
            path.radialGradient.innerColor = path.radialGradient.stops.front().color;
            path.radialGradient.outerColor = path.radialGradient.stops.back().color;
        }
    }
    if (conicGradient) {
        path.conicGradient.centerX = readFloat(command.payload + 128);
        path.conicGradient.centerY = readFloat(command.payload + 132);
        path.conicGradient.rotation = readFloat(command.payload + 136);
        path.miterLimit = readFloat(command.payload + 140);
        path.dashOffset = readFloat(command.payload + 144);
        if (!std::isfinite(path.conicGradient.centerX) ||
            !std::isfinite(path.conicGradient.centerY) ||
            !std::isfinite(path.conicGradient.rotation) ||
            !std::isfinite(path.miterLimit) || path.miterLimit < 1.0F ||
            path.miterLimit > 1000.0F || !std::isfinite(path.dashOffset)) return false;
        std::size_t offset = 152U;
        path.dashPattern.reserve(conicDashCount);
        for (std::uint16_t index = 0; index < conicDashCount; ++index, offset += 4U) {
            const float length = readFloat(command.payload + offset);
            if (!std::isfinite(length) || length <= 0.0F) return false;
            path.dashPattern.push_back(length);
        }
        float previous = -1.0F;
        for (std::uint8_t index = 0; index < conicStopCount; ++index, offset += 20U) {
            PathGradient::Stop stop{readFloat(command.payload + offset),
                {readFloat(command.payload + offset + 4), readFloat(command.payload + offset + 8),
                 readFloat(command.payload + offset + 12), readFloat(command.payload + offset + 16)}};
            if (!std::isfinite(stop.offset) || stop.offset < previous || stop.offset < 0.0F ||
                stop.offset > 1.0F) return false;
            previous = stop.offset;
            path.conicGradient.stops.push_back(stop);
        }
    }
    if (texturePaint) {
        path.texturePaint.textureId = readU32(command.payload + 128);
        path.texturePaint.sampling = static_cast<ImageSampling>(command.payload[132]);
        path.texturePaint.repeatX = command.payload[133] != 0U;
        path.texturePaint.repeatY = command.payload[134] != 0U;
        path.fillTexture = command.payload[135] == 0U;
        path.strokeTexture = command.payload[135] == 1U;
        path.texturePaint.sourceRect = {readFloat(command.payload + 136),
            readFloat(command.payload + 140), readFloat(command.payload + 144),
            readFloat(command.payload + 148)};
        path.texturePaint.uv = {readFloat(command.payload + 152), readFloat(command.payload + 156),
            readFloat(command.payload + 160), readFloat(command.payload + 164)};
        path.texturePaint.tint = {readFloat(command.payload + 168),
            readFloat(command.payload + 172), readFloat(command.payload + 176),
            readFloat(command.payload + 180)};
        path.miterLimit = readFloat(command.payload + 184);
        path.dashOffset = readFloat(command.payload + 188);
        if (path.texturePaint.textureId == 0U || !std::isfinite(path.miterLimit) ||
            path.miterLimit < 1.0F || path.miterLimit > 1000.0F ||
            !std::isfinite(path.dashOffset)) return false;
        path.dashPattern.reserve(textureDashCount);
        for (std::uint16_t index = 0; index < textureDashCount; ++index) {
            const float length = readFloat(command.payload + 200U + index * 4U);
            if (!std::isfinite(length) || length <= 0.0F) return false;
            path.dashPattern.push_back(length);
        }
    }
    const std::size_t dashOffset = (extended || styled) ? 176U : 128U;
    const bool styledDash = styled && (readFloat(command.payload + dashOffset) != 0.0F ||
        readFloat(command.payload + dashOffset + 4) != 0.0F ||
        readFloat(command.payload + dashOffset + 8) != 0.0F);
    const bool hasDash = dashed || extendedDashed || styledDash;
    path.dashLength = hasDash ? readFloat(command.payload + dashOffset) : 0.0F;
    path.gapLength = hasDash ? readFloat(command.payload + dashOffset + 4) : 0.0F;
    if (!styledRadialGradient && !conicGradient && !texturePaint)
        path.dashOffset = hasDash ? readFloat(command.payload + dashOffset + 8) : 0.0F;
    if ((hasDash || styled) && readU32(command.payload + dashOffset + 12) != 0U) return false;
    if (!styledRadialGradient && !conicGradient && !texturePaint)
        path.miterLimit = styled ? readFloat(command.payload + 192) : 4.0F;
    if (styled && (!std::isfinite(path.miterLimit) || path.miterLimit < 1.0F ||
        path.miterLimit > 1000.0F ||
        readU32(command.payload + 196) != 0U || readU32(command.payload + 200) != 0U ||
        readU32(command.payload + 204) != 0U)) return false;
    if (dashArray) {
        path.miterLimit = readFloat(command.payload + 176);
        path.dashOffset = readFloat(command.payload + 180);
        if (!std::isfinite(path.miterLimit) || path.miterLimit < 1.0F ||
            path.miterLimit > 1000.0F || !std::isfinite(path.dashOffset) ||
            readU32(command.payload + 188) != 0U) return false;
        const std::uint32_t count = readU32(command.payload + 184);
        path.dashPattern.reserve(count);
        for (std::uint32_t index = 0; index < count; ++index) {
            const float length = readFloat(command.payload + 192 + index * 4U);
            if (!std::isfinite(length) || length <= 0.0F) return false;
            path.dashPattern.push_back(length);
        }
    }
    if (multiGradient) {
        path.miterLimit = readFloat(command.payload + 176);
        path.dashOffset = readFloat(command.payload + 180);
        if (!std::isfinite(path.miterLimit) || path.miterLimit < 1.0F ||
            path.miterLimit > 1000.0F || !std::isfinite(path.dashOffset) ||
            readU16(command.payload + 190) != 0U) return false;
        path.gradient.spread = static_cast<PathGradient::Spread>(fillSpread);
        path.strokeGradientPaint.spread = static_cast<PathGradient::Spread>(strokeSpread);
        std::size_t offset = 192U;
        path.dashPattern.reserve(multiDashCount);
        for (std::uint16_t index = 0; index < multiDashCount; ++index, offset += 4U) {
            const float length = readFloat(command.payload + offset);
            if (!std::isfinite(length) || length <= 0.0F) return false;
            path.dashPattern.push_back(length);
        }
        const auto readStops = [&](std::uint8_t count, std::vector<PathGradient::Stop>& stops) {
            float previous = -1.0F;
            for (std::uint8_t index = 0; index < count; ++index, offset += 20U) {
                PathGradient::Stop stop{readFloat(command.payload + offset),
                    {readFloat(command.payload + offset + 4), readFloat(command.payload + offset + 8),
                     readFloat(command.payload + offset + 12), readFloat(command.payload + offset + 16)}};
                if (!std::isfinite(stop.offset) || stop.offset < previous || stop.offset < 0.0F ||
                    stop.offset > 1.0F) return false;
                previous = stop.offset;
                stops.push_back(stop);
            }
            return true;
        };
        if (!readStops(fillStopCount, path.gradient.stops) ||
            !readStops(strokeStopCount, path.strokeGradientPaint.stops)) return false;
    }
    return path.pathId != 0 && (path.fill || path.stroke) &&
           (!path.fillGradient || path.fill) &&
           (!path.fillRadialGradient || (anyRadialGradient && path.fill && !path.fillGradient)) &&
           (!path.strokeRadialGradient ||
            (anyRadialGradient && path.stroke && !path.strokeGradient)) &&
           (!anyRadialGradient || path.fillRadialGradient || path.strokeRadialGradient) &&
           (!path.fillConicGradient || (conicGradient && path.fill && !path.fillGradient &&
                                        !path.fillRadialGradient)) &&
           (!path.strokeConicGradient || (conicGradient && path.stroke && !path.strokeGradient &&
                                          !path.strokeRadialGradient)) &&
           (!conicGradient || path.fillConicGradient || path.strokeConicGradient) &&
           (!texturePaint || ((path.fillTexture && path.fill) ||
                              (path.strokeTexture && path.stroke))) &&
           (!extended || path.strokeGradient) &&
           (!path.strokeGradient || ((extended || styled || dashArray || multiGradient) && path.stroke)) &&
           (!(dashArray || (multiGradient && multiDashCount > 0U) ||
              (styledRadialGradient && styledRadialDashCount > 0U)) || path.stroke) &&
           (!(conicGradient && conicDashCount > 0U) || path.stroke) &&
           (!(texturePaint && textureDashCount > 0U) || path.stroke) &&
           (!multiGradient || ((fillStopCount == 0U || path.fillGradient) &&
                               (strokeStopCount == 0U || path.strokeGradient))) &&
           (!hasDash || (path.stroke && path.dashLength > 0.0F && path.gapLength > 0.0F));
}

bool decodeText(const CommandView& command, TextCommand& text) {
    constexpr std::size_t baseHeaderSize = 32;
    if (command.opcode != Opcode::drawText || command.payloadSize <= baseHeaderSize) return false;
    const std::uint8_t extension = command.payload[3];
    const std::size_t headerSize = extension == 4 ? 48 : extension == 3 ? 44
        : extension == 2 ? 40 : extension == 1 ? 36 : baseHeaderSize;
    if (command.opcode != Opcode::drawText || command.payloadSize <= headerSize ||
        command.payloadSize > headerSize + 65536 ||
        command.payload[0] > static_cast<std::uint8_t>(FontFamily::systemRounded) ||
        command.payload[1] > static_cast<std::uint8_t>(FontWeight::semibold) ||
        command.payload[2] > static_cast<std::uint8_t>(FontStyle::italic) ||
        extension > 4 || (extension >= 2 &&
            (command.payload[36] > (underlineText | strikeThroughText) ||
             command.payload[37] != 0 || command.payload[38] != 0 || command.payload[39] != 0)) ||
        (extension == 4 &&
            (command.payload[44] > static_cast<std::uint8_t>(TextAnchor::end) ||
             command.payload[45] > static_cast<std::uint8_t>(TextBaseline::alphabetic) ||
             command.payload[46] != 0 || command.payload[47] != 0))) {
        return false;
    }
    text.family = static_cast<FontFamily>(command.payload[0]);
    text.weight = static_cast<FontWeight>(command.payload[1]);
    text.style = static_cast<FontStyle>(command.payload[2]);
    text.letterSpacing = extension >= 1 ? readFloat(command.payload + 32) : 0.0F;
    text.decoration = extension >= 2 ? command.payload[36] : noTextDecoration;
    text.fontResourceId = extension >= 3 ? readU32(command.payload + 40) : 0;
    text.anchor = extension == 4 ? static_cast<TextAnchor>(command.payload[44]) : TextAnchor::start;
    text.baseline = extension == 4 ? static_cast<TextBaseline>(command.payload[45]) : TextBaseline::top;
    text.left = readFloat(command.payload + 4);
    text.top = readFloat(command.payload + 8);
    text.fontSize = readFloat(command.payload + 12);
    text.color = {readFloat(command.payload + 16), readFloat(command.payload + 20),
                  readFloat(command.payload + 24), readFloat(command.payload + 28)};
    text.text.assign(reinterpret_cast<const char*>(command.payload + headerSize),
                     command.payloadSize - headerSize);
    return (extension < 3 || extension == 4 || text.fontResourceId != 0) &&
           std::isfinite(text.letterSpacing) && std::fabs(text.letterSpacing) <= 10.0F &&
           text.text.find('\0') == std::string::npos;
}

bool decodeStyledText(const CommandView& command, TextCommand& text) {
    constexpr std::size_t headerSize = 64;
    if (command.opcode != Opcode::drawStyledText || command.payloadSize <= headerSize ||
        command.payloadSize > headerSize + 65536 ||
        command.payload[0] > static_cast<std::uint8_t>(FontFamily::systemRounded) ||
        command.payload[1] > static_cast<std::uint8_t>(FontWeight::semibold) ||
        command.payload[2] > static_cast<std::uint8_t>(FontStyle::italic) ||
        command.payload[3] > (underlineText | strikeThroughText) ||
        command.payload[40] > static_cast<std::uint8_t>(TextAnchor::end) ||
        command.payload[41] > static_cast<std::uint8_t>(TextBaseline::alphabetic) ||
        command.payload[42] != 0 || command.payload[43] != 0) return false;
    text.family = static_cast<FontFamily>(command.payload[0]);
    text.weight = static_cast<FontWeight>(command.payload[1]);
    text.style = static_cast<FontStyle>(command.payload[2]);
    text.decoration = command.payload[3];
    text.left = readFloat(command.payload + 4); text.top = readFloat(command.payload + 8);
    text.fontSize = readFloat(command.payload + 12);
    text.color = {readFloat(command.payload + 16), readFloat(command.payload + 20),
        readFloat(command.payload + 24), readFloat(command.payload + 28)};
    text.letterSpacing = readFloat(command.payload + 32);
    text.fontResourceId = readU32(command.payload + 36);
    text.anchor = static_cast<TextAnchor>(command.payload[40]);
    text.baseline = static_cast<TextBaseline>(command.payload[41]);
    text.strokeColor = {readFloat(command.payload + 44), readFloat(command.payload + 48),
        readFloat(command.payload + 52), readFloat(command.payload + 56)};
    text.strokeWidth = readFloat(command.payload + 60);
    text.text.assign(reinterpret_cast<const char*>(command.payload + headerSize),
                     command.payloadSize - headerSize);
    return std::isfinite(text.letterSpacing) && std::fabs(text.letterSpacing) <= 10.0F &&
        std::isfinite(text.strokeWidth) && text.strokeWidth > 0.0F && text.strokeWidth <= 4.0F &&
        text.text.find('\0') == std::string::npos;
}

bool decodeRichText(const CommandView& command, RichTextCommand& text) {
    constexpr std::size_t baseHeaderSize = 16, extendedHeaderSize = 20;
    const bool styledRuns = command.opcode == Opcode::drawStyledRichText;
    if ((!styledRuns && command.opcode != Opcode::drawRichText) ||
        command.payloadSize <= baseHeaderSize) return false;
    text.left = readFloat(command.payload);
    text.top = readFloat(command.payload + 4);
    text.fontSize = readFloat(command.payload + 8);
    const std::uint32_t encodedCount = readU32(command.payload + 12);
    const bool placed = (encodedCount & 0x80000000U) != 0;
    const bool scaledRuns = (encodedCount & 0x40000000U) != 0;
    const bool shiftedRuns = (encodedCount & 0x20000000U) != 0;
    const std::uint32_t count = encodedCount & 0x1fffffffU;
    const std::size_t runHeaderSize = 32 + (scaledRuns ? 4 : 0) + (shiftedRuns ? 4 : 0) +
                                      (styledRuns ? 20 : 0);
    const std::size_t headerSize = placed ? extendedHeaderSize : baseHeaderSize;
    if (placed && (command.payloadSize <= extendedHeaderSize || command.payload[16] > 2 ||
                   command.payload[17] > 1 || command.payload[18] != 0 || command.payload[19] != 0))
        return false;
    text.anchor = placed ? static_cast<TextAnchor>(command.payload[16]) : TextAnchor::start;
    text.baseline = placed ? static_cast<TextBaseline>(command.payload[17]) : TextBaseline::top;
    if (count == 0 || count > 256 || !std::isfinite(text.left) || !std::isfinite(text.top) ||
        !std::isfinite(text.fontSize) || text.fontSize <= 0.0F) return false;
    text.runs.clear(); text.runs.reserve(count);
    std::size_t offset = headerSize;
    for (std::uint32_t index = 0; index < count; ++index) {
        if (offset > command.payloadSize || command.payloadSize - offset < runHeaderSize) return false;
        const std::uint8_t* bytes = command.payload + offset;
        RichTextRun run{};
        if (bytes[0] > static_cast<std::uint8_t>(FontFamily::systemRounded) ||
            bytes[1] > static_cast<std::uint8_t>(FontWeight::semibold) ||
            bytes[2] > static_cast<std::uint8_t>(FontStyle::italic) ||
            bytes[3] > (underlineText | strikeThroughText)) return false;
        run.family = static_cast<FontFamily>(bytes[0]);
        run.weight = static_cast<FontWeight>(bytes[1]);
        run.style = static_cast<FontStyle>(bytes[2]);
        run.decoration = bytes[3];
        run.letterSpacing = readFloat(bytes + 4);
        run.fontResourceId = readU32(bytes + 8);
        run.color = {readFloat(bytes + 12), readFloat(bytes + 16),
                     readFloat(bytes + 20), readFloat(bytes + 24)};
        const std::uint32_t length = readU32(bytes + 28);
        run.fontScale = scaledRuns ? readFloat(bytes + 32) : 1.0F;
        run.baselineShift = shiftedRuns ? readFloat(bytes + 32 + (scaledRuns ? 4 : 0)) : 0.0F;
        const std::size_t strokeOffset = 32 + (scaledRuns ? 4 : 0) + (shiftedRuns ? 4 : 0);
        if (styledRuns) {
            run.strokeColor = {readFloat(bytes + strokeOffset), readFloat(bytes + strokeOffset + 4),
                readFloat(bytes + strokeOffset + 8), readFloat(bytes + strokeOffset + 12)};
            run.strokeWidth = readFloat(bytes + strokeOffset + 16);
        }
        offset += runHeaderSize;
        if (length == 0 || length > 65536 || length > command.payloadSize - offset ||
            !std::isfinite(run.color.red) || !std::isfinite(run.color.green) ||
            !std::isfinite(run.color.blue) || !std::isfinite(run.color.alpha) ||
            !std::isfinite(run.letterSpacing) || std::fabs(run.letterSpacing) > 10.0F ||
            !std::isfinite(run.fontScale) || run.fontScale <= 0.0F || run.fontScale > 16.0F ||
            !std::isfinite(run.baselineShift) || std::fabs(run.baselineShift) > 16.0F ||
            !std::isfinite(run.strokeWidth) || run.strokeWidth < 0.0F || run.strokeWidth > 4.0F ||
            (styledRuns && (!std::isfinite(run.strokeColor.red) ||
                !std::isfinite(run.strokeColor.green) || !std::isfinite(run.strokeColor.blue) ||
                !std::isfinite(run.strokeColor.alpha))))
            return false;
        run.text.assign(reinterpret_cast<const char*>(command.payload + offset), length);
        if (run.text.find('\0') != std::string::npos) return false;
        offset += length;
        text.runs.push_back(std::move(run));
    }
    return offset == command.payloadSize;
}

} // namespace gfx
