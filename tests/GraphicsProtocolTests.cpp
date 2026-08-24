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
    encoder.pushTransform({0.8F, 0.2F, -0.2F, 0.8F, 0.1F, -0.1F});
    encoder.popTransform();
    encoder.pushOpacity(0.625F);
    encoder.popOpacity();
    encoder.drawShadow({{-0.6F, 0.6F, 0.6F, -0.4F}, 14.0F, 18.0F, 2.0F,
                        {0.0F, 0.1F, 0.2F, 0.55F}});
    encoder.drawRadialGradient({{-0.8F, 0.8F, 0.8F, -0.8F}, 0.3F, 0.4F, 120.0F, 16.0F,
                                {1.0F, 0.8F, 0.2F, 1.0F},
                                {0.1F, 0.0F, 0.4F, 0.8F}});
    encoder.drawRoundedRect({{-0.7F, 0.5F, 0.7F, -0.5F}, 18.0F, 3.0F,
                             {0.1F, 0.2F, 0.5F, 1.0F},
                             {0.5F, 0.8F, 1.0F, 0.9F}});
    encoder.drawCircle({{-0.4F, 0.4F, 0.4F, -0.4F}, 2.5F,
                        {0.1F, 0.8F, 0.4F, 1.0F},
                        {0.7F, 1.0F, 0.8F, 0.9F}});
    encoder.drawDiagonalPattern({{-0.9F, 0.3F, 0.9F, -0.3F}, 8.0F, 10.0F, 3.5F, true,
                                 {1.0F, 0.5F, 0.1F, 0.8F}});
    encoder.drawLinearGradient({{-0.8F, 0.2F, 0.8F, -0.2F}, 12.0F,
                                gfx::GradientDirection::diagonal,
                                {0.2F, 0.8F, 1.0F, 1.0F},
                                {0.7F, 0.2F, 1.0F, 0.75F}});
    encoder.drawLinearGradientCircle({{-0.4F, 0.4F, 0.4F, -0.4F},
                                      gfx::GradientDirection::vertical,
                                      {0.1F, 0.9F, 0.7F, 1.0F},
                                      {0.5F, 0.2F, 1.0F, 0.8F}});
    encoder.drawGridPattern({{-0.9F, 0.9F, 0.9F, -0.9F}, 24.0F, 1.0F, 2.0F,
                             3.0F, -4.0F, 5, 12.0F,
                             {0.2F, 0.4F, 0.8F, 0.25F},
                             {0.3F, 0.7F, 1.0F, 0.5F}});
    encoder.drawConicGradient({{-0.3F, 0.3F, 0.3F, -0.3F}, 0.5F, 0.5F, 1.25F, 30.0F,
                               {0.1F, 0.8F, 1.0F, 1.0F}, {0.7F, 0.2F, 1.0F, 1.0F},
                               {0.1F, 0.8F, 1.0F, 1.0F}});
    encoder.drawImageSurface({9, gfx::ImageSampling::nearest,
                              {-0.6F, 0.6F, 0.6F, -0.6F},
                              {0.1F, 0.2F, 0.9F, 0.8F},
                              {0.8F, 1.0F, 0.7F, 0.9F}, 14.0F});
    encoder.drawTiledImageSurface({10, gfx::ImageSampling::linear,
                                   {-0.8F, 0.4F, 0.8F, -0.4F},
                                   {-0.25F, 0.0F, 4.75F, 1.0F},
                                   {1.0F, 0.9F, 0.8F, 1.0F}, 8.0F, true, false});
    encoder.drawNineSliceImage({11, gfx::ImageSampling::nearest,
                                {-0.9F, 0.7F, 0.9F, -0.7F}, {0.0F, 0.0F, 1.0F, 1.0F},
                                {1.0F, 1.0F, 1.0F, 1.0F}, {0.1F, 0.2F, 0.1F, 0.2F},
                                {16.0F, 12.0F, 16.0F, 12.0F}, 10.0F});
    encoder.drawDotGrid({{-0.3F, 0.3F, 0.3F, -0.3F}, 4, 4, 0xA142U, 7,
                         6.0F, 4.0F, 2.0F,
                         {0.4F, 0.9F, 0.6F, 1.0F}, {0.4F, 0.9F, 0.6F, 0.8F},
                         {0.8F, 1.0F, 0.9F, 1.0F}});
    encoder.drawWaveDots({{-0.9F, 0.2F, 0.9F, -0.2F}, 24, 12.0F, 3.5F, 15.0F,
                          1.25F, 0.56F, 1.0F,
                          {0.22F, 0.36F, 1.0F, 1.0F}, {0.16F, 1.0F, 0.62F, 1.0F},
                          {0.56F, 0.36F, 1.0F, 1.0F}, {0.16F, 1.0F, 0.82F, 1.0F},
                          {0.72F, 0.94F, 1.0F, 0.65F}});
    encoder.drawMesh({31, {-0.5F, 0.5F, 0.5F, -0.5F}, {0.0F, 0.0F, 1.0F, 1.0F}});
    encoder.drawImage({7, {-0.5F, 0.5F, 0.5F, -0.5F}, {0.0F, 0.0F, 1.0F, 1.0F},
                       {1.0F, 0.8F, 0.6F, 1.0F}});
    encoder.drawPath({12, true, true, gfx::FillRule::nonzero,
                      gfx::LineCap::square, gfx::LineJoin::miter, 2.0F, 0.25F,
                      {-0.8F, 0.8F, -0.4F, 0.4F}, {0.0F, 0.0F, 24.0F, 24.0F},
                      {0.0F, 0.0F, 0.0F, 0.0F}, {1.0F, 0.5F, 0.1F, 1.0F}, true,
                      {0.0F, 0.0F, 24.0F, 0.0F,
                       {0.0F, 0.4F, 0.8F, 1.0F}, {0.8F, 0.2F, 1.0F, 1.0F},
                       {{0.0F, {0.0F, 0.4F, 0.8F, 1.0F}},
                        {0.5F, {0.2F, 1.0F, 0.6F, 1.0F}},
                        {1.0F, {0.8F, 0.2F, 1.0F, 1.0F}}},
                       gfx::PathGradient::Spread::reflect}, true,
                      {0.0F, 0.0F, 24.0F, 24.0F,
                      {1.0F, 0.2F, 0.1F, 1.0F}, {1.0F, 0.9F, 0.2F, 1.0F}, {},
                      gfx::PathGradient::Spread::pad},
                      0.0F, 0.0F, -2.0F, 6.0F, {7.0F, 4.0F, 2.0F, 4.0F}});
    gfx::PathCommand radialPath{};
    radialPath.pathId = 12;
    radialPath.fill = true;
    radialPath.fillRadialGradient = true;
    radialPath.tolerance = 0.25F;
    radialPath.destination = {-0.4F, 0.4F, 0.4F, -0.4F};
    radialPath.viewBox = {0.0F, 0.0F, 24.0F, 24.0F};
    radialPath.radialGradient = {12.0F, 12.0F, 10.0F, 0.0F, 0.0F, 8.0F,
        {1.0F, 1.0F, 1.0F, 1.0F}, {0.1F, 0.8F, 0.5F, 1.0F}, {},
        gfx::PathGradient::Spread::pad, false, 0.0F, 0.0F, 0.0F};
    encoder.drawPath(radialPath);
    gfx::PathCommand radialStrokePath = radialPath;
    radialStrokePath.fill = false;
    radialStrokePath.fillRadialGradient = false;
    radialStrokePath.stroke = true;
    radialStrokePath.strokeRadialGradient = true;
    radialStrokePath.strokeWidth = 2.0F;
    encoder.drawPath(radialStrokePath);
    gfx::PathCommand styledRadialStrokePath = radialStrokePath;
    styledRadialStrokePath.miterLimit = 6.0F;
    styledRadialStrokePath.dashOffset = -2.0F;
    styledRadialStrokePath.dashPattern = {7.0F, 4.0F, 2.0F, 4.0F};
    styledRadialStrokePath.radialGradient.hasFocalPoint = true;
    styledRadialStrokePath.radialGradient.focalX = 9.0F;
    styledRadialStrokePath.radialGradient.focalY = 10.0F;
    styledRadialStrokePath.radialGradient.focalRadius = 0.2F;
    styledRadialStrokePath.radialGradient.spread = gfx::PathGradient::Spread::reflect;
    styledRadialStrokePath.radialGradient.stops = {
        {0.0F, {1.0F, 1.0F, 1.0F, 1.0F}},
        {0.4F, {0.2F, 0.9F, 0.7F, 1.0F}},
        {1.0F, {0.1F, 0.8F, 0.5F, 1.0F}},
    };
    encoder.drawPath(styledRadialStrokePath);
    gfx::PathCommand conicPath{};
    conicPath.pathId = 12;
    conicPath.stroke = true;
    conicPath.strokeConicGradient = true;
    conicPath.strokeWidth = 3.0F;
    conicPath.tolerance = 0.25F;
    conicPath.destination = {-0.4F, 0.4F, 0.4F, -0.4F};
    conicPath.viewBox = {0.0F, 0.0F, 24.0F, 24.0F};
    conicPath.miterLimit = 7.0F;
    conicPath.dashOffset = -1.5F;
    conicPath.dashPattern = {6.0F, 3.0F};
    conicPath.conicGradient = {12.0F, 12.0F, 0.75F, {
        {0.0F, {0.1F, 0.8F, 1.0F, 1.0F}},
        {0.5F, {0.8F, 0.2F, 1.0F, 1.0F}},
        {1.0F, {0.1F, 0.8F, 1.0F, 1.0F}},
    }};
    encoder.drawPath(conicPath);
    gfx::PathCommand texturePath{};
    texturePath.pathId = 12;
    texturePath.fill = true;
    texturePath.fillColor = {0.02F, 0.04F, 0.08F, 1.0F};
    texturePath.stroke = true;
    texturePath.strokeTexture = true;
    texturePath.strokeWidth = 3.0F;
    texturePath.tolerance = 0.25F;
    texturePath.destination = {-0.4F, 0.4F, 0.4F, -0.4F};
    texturePath.viewBox = {0.0F, 0.0F, 24.0F, 24.0F};
    texturePath.miterLimit = 5.0F;
    texturePath.dashOffset = -1.0F;
    texturePath.dashPattern = {5.0F, 3.0F, 2.0F, 3.0F};
    texturePath.texturePaint = {7, gfx::ImageSampling::nearest, true, false,
        {2.0F, 3.0F, 12.0F, 8.0F}, {0.1F, 0.2F, 0.8F, 0.9F},
        {0.8F, 1.0F, 0.9F, 0.75F}};
    encoder.drawPath(texturePath);
    gfx::PathCommand multiRadialPath = radialPath;
    multiRadialPath.radialGradient.stops = {
        {0.0F, {1.0F, 1.0F, 1.0F, 1.0F}},
        {0.4F, {0.2F, 0.9F, 0.7F, 1.0F}},
        {1.0F, {0.1F, 0.8F, 0.5F, 1.0F}},
    };
    multiRadialPath.radialGradient.spread = gfx::PathGradient::Spread::reflect;
    encoder.drawPath(multiRadialPath);
    gfx::PathCommand focalRadialPath = radialPath;
    focalRadialPath.radialGradient.hasFocalPoint = true;
    focalRadialPath.radialGradient.focalX = 9.0F;
    focalRadialPath.radialGradient.focalY = 10.0F;
    encoder.drawPath(focalRadialPath);
    gfx::PathCommand twoCircleRadialPath = focalRadialPath;
    twoCircleRadialPath.radialGradient.focalRadius = 0.2F;
    encoder.drawPath(twoCircleRadialPath);
    encoder.drawText({gfx::FontFamily::systemRounded, gfx::FontWeight::semibold,
                      gfx::FontStyle::italic,
                      0.08F,
                      gfx::underlineText | gfx::strikeThroughText,
                      77,
                      -0.8F, 0.7F, 0.08F,
                      {0.7F, 0.9F, 1.0F, 1.0F}, "Hello — Ω",
                      gfx::TextAnchor::middle, gfx::TextBaseline::alphabetic});
    gfx::TextCommand outlined{gfx::FontFamily::systemRounded, gfx::FontWeight::bold,
        gfx::FontStyle::regular, 0.02F, gfx::noTextDecoration, 0, -0.5F, 0.2F, 0.1F,
        {0.9F, 0.9F, 1.0F, 1.0F}, "OUTLINE", gfx::TextAnchor::middle,
        gfx::TextBaseline::alphabetic};
    outlined.strokeColor = {1.0F, 0.4F, 0.1F, 1.0F}; outlined.strokeWidth = 0.08F;
    encoder.drawStyledText(outlined);
    encoder.drawRichText({-0.7F, 0.5F, 0.07F, {
        {gfx::FontFamily::systemSans, gfx::FontWeight::bold, gfx::FontStyle::regular,
         0.0F, gfx::noTextDecoration, 0, {1.0F, 0.4F, 0.2F, 1.0F}, "Rich "},
        {gfx::FontFamily::systemSerif, gfx::FontWeight::regular, gfx::FontStyle::italic,
         0.04F, gfx::underlineText, 77, {0.3F, 0.9F, 1.0F, 1.0F}, "text", 1.5F, 0.35F},
    }, gfx::TextAnchor::middle, gfx::TextBaseline::alphabetic});
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
    gfx::AffineTransform transform{};
    if (!gfx::decodePushTransform(command, transform) || !nearlyEqual(transform.m11, 0.8F) ||
        !nearlyEqual(transform.translateY, -0.1F) || !decoder.next(command) ||
        command.opcode != gfx::Opcode::popTransform || command.payloadSize != 0 ||
        !decoder.next(command)) {
        return fail("Transform decoding failed");
    }
    float opacity = 0.0F;
    if (!gfx::decodePushOpacity(command, opacity) || !nearlyEqual(opacity, 0.625F) ||
        !decoder.next(command) || command.opcode != gfx::Opcode::popOpacity ||
        command.payloadSize != 0 || !decoder.next(command)) {
        return fail("Opacity decoding failed");
    }
    gfx::ShadowCommand shadow{};
    if (!gfx::decodeShadow(command, shadow) || !nearlyEqual(shadow.blur, 18.0F) ||
        !nearlyEqual(shadow.destination.bottom, -0.4F) ||
        !nearlyEqual(shadow.color.alpha, 0.55F) || !decoder.next(command)) {
        return fail("Shadow decoding failed");
    }
    gfx::RadialGradientCommand radial{};
    if (!gfx::decodeRadialGradient(command, radial) || !nearlyEqual(radial.centerX, 0.3F) ||
        !nearlyEqual(radial.radius, 120.0F) || !nearlyEqual(radial.outerColor.blue, 0.4F) ||
        !decoder.next(command)) {
        return fail("Radial-gradient decoding failed");
    }
    gfx::RoundedRectCommand rectangle{};
    if (!gfx::decodeRoundedRect(command, rectangle) ||
        !nearlyEqual(rectangle.cornerRadius, 18.0F) ||
        !nearlyEqual(rectangle.borderWidth, 3.0F) ||
        !nearlyEqual(rectangle.borderColor.green, 0.8F) || !decoder.next(command)) {
        return fail("Rounded-rectangle decoding failed");
    }
    gfx::CircleCommand circle{};
    if (!gfx::decodeCircle(command, circle) || !nearlyEqual(circle.borderWidth, 2.5F) ||
        !nearlyEqual(circle.fillColor.green, 0.8F) ||
        !nearlyEqual(circle.borderColor.alpha, 0.9F) || !decoder.next(command)) {
        return fail("Circle decoding failed");
    }
    gfx::DiagonalPatternCommand pattern{};
    if (!gfx::decodeDiagonalPattern(command, pattern) ||
        !nearlyEqual(pattern.stripeWidth, 8.0F) || !nearlyEqual(pattern.offset, 3.5F) ||
        !pattern.backward || !nearlyEqual(pattern.color.alpha, 0.8F) ||
        !decoder.next(command)) {
        return fail("Diagonal-pattern decoding failed");
    }
    gfx::LinearGradientCommand linear{};
    if (!gfx::decodeLinearGradient(command, linear) ||
        linear.direction != gfx::GradientDirection::diagonal ||
        !nearlyEqual(linear.cornerRadius, 12.0F) ||
        !nearlyEqual(linear.startColor.green, 0.8F) ||
        !nearlyEqual(linear.endColor.alpha, 0.75F) || !decoder.next(command)) {
        return fail("Linear-gradient decoding failed");
    }
    gfx::LinearGradientCircleCommand linearCircle{};
    if (!gfx::decodeLinearGradientCircle(command, linearCircle) ||
        linearCircle.direction != gfx::GradientDirection::vertical ||
        !nearlyEqual(linearCircle.startColor.green, 0.9F) ||
        !nearlyEqual(linearCircle.endColor.alpha, 0.8F) || !decoder.next(command)) {
        return fail("Linear-gradient circle decoding failed");
    }
    gfx::GridPatternCommand technicalGrid{};
    if (!gfx::decodeGridPattern(command, technicalGrid) ||
        !nearlyEqual(technicalGrid.spacing, 24.0F) ||
        !nearlyEqual(technicalGrid.offsetY, -4.0F) || technicalGrid.majorEvery != 5 ||
        !nearlyEqual(technicalGrid.cornerRadius, 12.0F) ||
        !nearlyEqual(technicalGrid.majorColor.alpha, 0.5F) || !decoder.next(command)) {
        return fail("Grid-pattern decoding failed");
    }
    gfx::ConicGradientCommand conic{};
    if (!gfx::decodeConicGradient(command, conic) ||
        !nearlyEqual(conic.rotation, 1.25F) || !nearlyEqual(conic.cornerRadius, 30.0F) ||
        !nearlyEqual(conic.middleColor.red, 0.7F) || !decoder.next(command)) {
        return fail("Conic-gradient decoding failed");
    }
    gfx::ImageSurfaceCommand imageSurface{};
    if (!gfx::decodeImageSurface(command, imageSurface) || imageSurface.textureId != 9 ||
        imageSurface.sampling != gfx::ImageSampling::nearest ||
        !nearlyEqual(imageSurface.uv.left, 0.1F) ||
        !nearlyEqual(imageSurface.cornerRadius, 14.0F) || !decoder.next(command)) {
        return fail("Image-surface decoding failed");
    }
    gfx::ImageSurfaceCommand tiledImage{};
    if (!gfx::decodeTiledImageSurface(command, tiledImage) || tiledImage.textureId != 10 ||
        tiledImage.sampling != gfx::ImageSampling::linear || !tiledImage.repeatX ||
        tiledImage.repeatY || !nearlyEqual(tiledImage.uv.left, -0.25F) ||
        !nearlyEqual(tiledImage.uv.right, 4.75F) || !decoder.next(command)) {
        return fail("Tiled image-surface decoding failed");
    }
    gfx::NineSliceImageCommand nineSlice{};
    if (!gfx::decodeNineSliceImage(command, nineSlice) || nineSlice.textureId != 11 ||
        nineSlice.sampling != gfx::ImageSampling::nearest ||
        !nearlyEqual(nineSlice.sourceInsets.top, 0.2F) ||
        !nearlyEqual(nineSlice.destinationInsets.left, 16.0F) ||
        !nearlyEqual(nineSlice.cornerRadius, 10.0F) || !decoder.next(command)) {
        return fail("Nine-slice image decoding failed");
    }
    gfx::DotGridCommand grid{};
    if (!gfx::decodeDotGrid(command, grid) || grid.rows != 4 || grid.columns != 4 ||
        grid.filledMask != 0xA142U || grid.activeIndex != 7 ||
        !nearlyEqual(grid.radius, 4.0F) ||
        !nearlyEqual(grid.highlightColor.green, 1.0F) || !decoder.next(command)) {
        return fail("Dot-grid decoding failed");
    }
    gfx::WaveDotsCommand wave{};
    if (!gfx::decodeWaveDots(command, wave) || wave.count != 24 ||
        !nearlyEqual(wave.minimumRadius, 3.5F) || !nearlyEqual(wave.phase, 1.25F) ||
        !nearlyEqual(wave.frequency, 0.56F) ||
        !nearlyEqual(wave.crestEndColor.blue, 0.82F) || !decoder.next(command)) {
        return fail("Wave-dots decoding failed");
    }
    gfx::MeshCommand mesh{};
    if (!gfx::decodeMesh(command, mesh) || mesh.meshId != 31 ||
        !nearlyEqual(mesh.destination.left, -0.5F) ||
        !nearlyEqual(mesh.viewBox.width, 1.0F) || !decoder.next(command)) {
        return fail("Mesh decoding failed");
    }
    gfx::ImageCommand image{};
    if (!gfx::decodeImage(command, image) || image.textureId != 7 ||
        !nearlyEqual(image.destination.left, -0.5F) || !nearlyEqual(image.tint.green, 0.8F) ||
        !decoder.next(command)) {
        return fail("Image decoding failed");
    }
    gfx::PathCommand path{};
    if (!gfx::decodePath(command, path) || path.pathId != 12 || !path.fill || !path.stroke ||
        path.lineCap != gfx::LineCap::square || path.lineJoin != gfx::LineJoin::miter ||
        !nearlyEqual(path.strokeWidth, 2.0F) ||
        !nearlyEqual(path.viewBox.width, 24.0F) || !nearlyEqual(path.strokeColor.green, 0.5F) ||
        !path.fillGradient || !nearlyEqual(path.gradient.endColor.blue, 1.0F) ||
        path.gradient.stops.size() != 3 ||
        !nearlyEqual(path.gradient.stops[1].offset, 0.5F) ||
        path.gradient.spread != gfx::PathGradient::Spread::reflect ||
        !path.strokeGradient ||
        !nearlyEqual(path.strokeGradientPaint.endColor.green, 0.9F) ||
        !nearlyEqual(path.dashOffset, -2.0F) ||
        !nearlyEqual(path.miterLimit, 6.0F) ||
        path.dashPattern != std::vector<float>({7.0F, 4.0F, 2.0F, 4.0F}) ||
        !decoder.next(command)) {
        return fail("Path decoding failed");
    }
    gfx::PathCommand radialPathDecoded{};
    if (!gfx::decodePath(command, radialPathDecoded) ||
        !radialPathDecoded.fillRadialGradient ||
        !nearlyEqual(radialPathDecoded.radialGradient.centerX, 12.0F) ||
        !nearlyEqual(radialPathDecoded.radialGradient.axisYY, 8.0F) ||
        !decoder.next(command)) {
        return fail("Radial path decoding failed");
    }
    gfx::PathCommand radialStrokePathDecoded{};
    if (!gfx::decodePath(command, radialStrokePathDecoded) ||
        radialStrokePathDecoded.fill || !radialStrokePathDecoded.stroke ||
        radialStrokePathDecoded.fillRadialGradient ||
        !radialStrokePathDecoded.strokeRadialGradient ||
        !nearlyEqual(radialStrokePathDecoded.radialGradient.axisYY, 8.0F) ||
        !decoder.next(command)) {
        return fail("Radial stroke path decoding failed");
    }
    gfx::PathCommand styledRadialStrokePathDecoded{};
    if (!gfx::decodePath(command, styledRadialStrokePathDecoded) ||
        !styledRadialStrokePathDecoded.strokeRadialGradient ||
        styledRadialStrokePathDecoded.dashPattern !=
            std::vector<float>({7.0F, 4.0F, 2.0F, 4.0F}) ||
        !nearlyEqual(styledRadialStrokePathDecoded.dashOffset, -2.0F) ||
        !nearlyEqual(styledRadialStrokePathDecoded.miterLimit, 6.0F) ||
        styledRadialStrokePathDecoded.radialGradient.spread !=
            gfx::PathGradient::Spread::reflect ||
        styledRadialStrokePathDecoded.radialGradient.stops.size() != 3U ||
        !decoder.next(command)) {
        return fail("Styled radial stroke path decoding failed");
    }
    gfx::PathCommand conicPathDecoded{};
    if (!gfx::decodePath(command, conicPathDecoded) ||
        !conicPathDecoded.strokeConicGradient || conicPathDecoded.fillConicGradient ||
        conicPathDecoded.conicGradient.stops.size() != 3U ||
        !nearlyEqual(conicPathDecoded.conicGradient.centerX, 12.0F) ||
        !nearlyEqual(conicPathDecoded.conicGradient.rotation, 0.75F) ||
        !nearlyEqual(conicPathDecoded.miterLimit, 7.0F) ||
        !nearlyEqual(conicPathDecoded.dashOffset, -1.5F) ||
        conicPathDecoded.dashPattern != std::vector<float>({6.0F, 3.0F}) ||
        !decoder.next(command)) {
        return fail("Conic path decoding failed");
    }
    gfx::PathCommand texturePathDecoded{};
    if (!gfx::decodePath(command, texturePathDecoded) ||
        !texturePathDecoded.fill || !texturePathDecoded.stroke ||
        !texturePathDecoded.strokeTexture || texturePathDecoded.fillTexture ||
        texturePathDecoded.texturePaint.textureId != 7U ||
        texturePathDecoded.texturePaint.sampling != gfx::ImageSampling::nearest ||
        !texturePathDecoded.texturePaint.repeatX || texturePathDecoded.texturePaint.repeatY ||
        !nearlyEqual(texturePathDecoded.texturePaint.sourceRect.width, 12.0F) ||
        !nearlyEqual(texturePathDecoded.texturePaint.tint.alpha, 0.75F) ||
        texturePathDecoded.dashPattern != std::vector<float>({5.0F, 3.0F, 2.0F, 3.0F}) ||
        !decoder.next(command)) {
        return fail("Texture path decoding failed");
    }
    gfx::PathCommand multiRadialPathDecoded{};
    if (!gfx::decodePath(command, multiRadialPathDecoded) ||
        multiRadialPathDecoded.radialGradient.stops.size() != 3U ||
        multiRadialPathDecoded.radialGradient.spread != gfx::PathGradient::Spread::reflect ||
        !nearlyEqual(multiRadialPathDecoded.radialGradient.stops[1].offset, 0.4F) ||
        !nearlyEqual(multiRadialPathDecoded.radialGradient.stops[1].color.green, 0.9F) ||
        !decoder.next(command)) {
        return fail("Multi-stop radial path decoding failed");
    }
    gfx::PathCommand focalRadialPathDecoded{};
    if (!gfx::decodePath(command, focalRadialPathDecoded) ||
        !focalRadialPathDecoded.radialGradient.hasFocalPoint ||
        !nearlyEqual(focalRadialPathDecoded.radialGradient.focalX, 9.0F) ||
        focalRadialPathDecoded.radialGradient.stops.size() != 2U ||
        !decoder.next(command)) {
        return fail("Focal radial path decoding failed");
    }
    gfx::PathCommand twoCircleRadialPathDecoded{};
    if (!gfx::decodePath(command, twoCircleRadialPathDecoded) ||
        !twoCircleRadialPathDecoded.radialGradient.hasFocalPoint ||
        !nearlyEqual(twoCircleRadialPathDecoded.radialGradient.focalRadius, 0.2F) ||
        twoCircleRadialPathDecoded.radialGradient.stops.size() != 2U ||
        !decoder.next(command)) {
        return fail("Two-circle radial path decoding failed");
    }
    gfx::TextCommand text{};
    if (!gfx::decodeText(command, text) || text.family != gfx::FontFamily::systemRounded ||
        text.weight != gfx::FontWeight::semibold || text.style != gfx::FontStyle::italic ||
        !nearlyEqual(text.letterSpacing, 0.08F) ||
        text.decoration != (gfx::underlineText | gfx::strikeThroughText) ||
        text.fontResourceId != 77 ||
        text.anchor != gfx::TextAnchor::middle || text.baseline != gfx::TextBaseline::alphabetic ||
        text.text != "Hello — Ω" || !nearlyEqual(text.fontSize, 0.08F) || !decoder.next(command)) {
        return fail("Text decoding failed");
    }
    gfx::TextCommand outlinedDecoded{};
    if (!gfx::decodeStyledText(command, outlinedDecoded) || outlinedDecoded.text != "OUTLINE" ||
        outlinedDecoded.anchor != gfx::TextAnchor::middle ||
        !nearlyEqual(outlinedDecoded.strokeColor.red, 1.0F) ||
        !nearlyEqual(outlinedDecoded.strokeWidth, 0.08F) || !decoder.next(command)) {
        return fail("Styled text decoding failed");
    }
    gfx::RichTextCommand rich{};
    if (!gfx::decodeRichText(command, rich) || rich.runs.size() != 2 ||
        rich.runs[0].text != "Rich " || rich.runs[0].weight != gfx::FontWeight::bold ||
        rich.runs[1].text != "text" || rich.runs[1].family != gfx::FontFamily::systemSerif ||
        rich.runs[1].decoration != gfx::underlineText || rich.runs[1].fontResourceId != 77 ||
        !nearlyEqual(rich.runs[1].fontScale, 1.5F) ||
        !nearlyEqual(rich.runs[1].baselineShift, 0.35F) ||
        rich.anchor != gfx::TextAnchor::middle || rich.baseline != gfx::TextBaseline::alphabetic ||
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
