#include "GraphicsProtocol.hpp"

#include <cmath>
#include <iostream>
#include <vector>

namespace {

bool nearlyEqual(float left, float right) {
    return std::fabs(left - right) < 0.00001F;
}

int fail(const char* message) {
    std::cerr << message << '\n';
    return 1;
}

} // namespace

int main() {
    constexpr gfx::Vertex vertices[] = {
        {{0.0F, 0.5F}, {1.0F, 0.0F, 0.0F, 1.0F}},
        {{-0.5F, -0.5F}, {0.0F, 1.0F, 0.0F, 1.0F}},
        {{0.5F, -0.5F}, {0.0F, 0.0F, 1.0F, 1.0F}},
    };

    gfx::CommandEncoder encoder;
    encoder.clear({0.1F, 0.2F, 0.3F, 1.0F});
    encoder.draw(gfx::Primitive::triangleList, vertices, 3);
    encoder.pushClip({0.1F, 0.2F, 0.8F, 0.9F});
    encoder.popClip();
    encoder.drawImage({7, {-0.5F, 0.5F, 0.5F, -0.5F}, {0.0F, 0.0F, 1.0F, 1.0F},
                       {1.0F, 0.8F, 0.6F, 1.0F}});
    encoder.drawPath({12, true, true, gfx::FillRule::nonzero,
                      gfx::LineCap::round, gfx::LineJoin::round, 2.0F, 0.25F,
                      {-0.8F, 0.8F, -0.4F, 0.4F}, {0.0F, 0.0F, 24.0F, 24.0F},
                      {0.0F, 0.0F, 0.0F, 0.0F}, {1.0F, 0.5F, 0.1F, 1.0F}, true,
                      {0.0F, 0.0F, 24.0F, 0.0F,
                       {0.0F, 0.4F, 0.8F, 1.0F}, {0.8F, 0.2F, 1.0F, 1.0F}}});
    encoder.endFrame();
    const std::vector<std::uint8_t> bytes = encoder.finish();

    gfx::CommandDecoder decoder(bytes);
    gfx::CommandView command{};
    gfx::Color clear{};
    if (!decoder.next(command) || !gfx::decodeClear(command, clear) ||
        !nearlyEqual(clear.blue, 0.3F)) {
        return fail("Clear command did not survive the binary round trip");
    }

    gfx::DrawCommand draw{};
    if (!decoder.next(command) || !gfx::decodeDraw(command, draw) ||
        draw.primitive != gfx::Primitive::triangleList || draw.vertices.size() != 3 ||
        !nearlyEqual(draw.vertices[2].position[0], 0.5F)) {
        return fail("Draw command did not survive the binary round trip");
    }

    gfx::ClipRect clip{};
    if (!decoder.next(command) || !gfx::decodePushClip(command, clip) ||
        !nearlyEqual(clip.left, 0.1F) || !nearlyEqual(clip.bottom, 0.9F) ||
        !decoder.next(command) || command.opcode != gfx::Opcode::popClip || command.payloadSize != 0 ||
        !decoder.next(command)) {
        return fail("Clip decoding failed");
    }
    gfx::ImageCommand image{};
    if (!gfx::decodeImage(command, image) || image.textureId != 7 ||
        !nearlyEqual(image.destination.left, -0.5F) || !nearlyEqual(image.tint.green, 0.8F) ||
        !decoder.next(command)) {
        return fail("Image decoding failed");
    }
    gfx::PathCommand path{};
    if (!gfx::decodePath(command, path) || path.pathId != 12 || !path.fill || !path.stroke ||
        path.lineCap != gfx::LineCap::round || !nearlyEqual(path.strokeWidth, 2.0F) ||
        !nearlyEqual(path.viewBox.width, 24.0F) || !nearlyEqual(path.strokeColor.green, 0.5F) ||
        !path.fillGradient || !nearlyEqual(path.gradient.endColor.blue, 1.0F) ||
        !decoder.next(command) || command.opcode != gfx::Opcode::endFrame ||
        decoder.next(command) || !decoder.valid()) {
        return fail("End-of-frame decoding failed");
    }

    std::vector<std::uint8_t> truncated = bytes;
    truncated.pop_back();
    gfx::CommandDecoder invalidDecoder(truncated);
    if (invalidDecoder.valid()) {
        return fail("Decoder accepted a stream with a mismatched byte count");
    }

    return 0;
}
