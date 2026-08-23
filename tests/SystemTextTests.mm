#include "SystemText.hpp"

#include <cmath>
#include <fstream>
#include <iostream>
#include <iterator>

int main() {
    const gfx::ShapedText sans = gfx::shapeSystemText("Hello, MGFX — Ω", gfx::FontFamily::systemSans);
    if (sans.ascent <= 0.0F) {
        std::cerr << "System text ascent was not reported\n";
        return 1;
    }
    if (sans.triangles.empty() || sans.triangles.size() % 3 != 0 || sans.advance <= 0.0F) {
        std::cerr << "System Unicode shaping produced no drawable glyph geometry\n";
        return 1;
    }
    if (std::fabs(gfx::measureSystemText("Hello, MGFX — Ω", gfx::FontFamily::systemSans) -
                  sans.advance) > 0.0001F) {
        std::cerr << "Fast text measurement disagrees with shaped geometry metrics\n";
        return 1;
    }
    const gfx::ShapedText mono = gfx::shapeSystemText("iiiiWWWW", gfx::FontFamily::systemMonospace);
    if (mono.triangles.empty() || mono.advance <= 4.0F || mono.advance >= 6.0F) {
        std::cerr << "Monospaced system font metrics are implausible\n";
        return 1;
    }
    const gfx::ShapedText serif = gfx::shapeSystemText(
        "Serif typography", gfx::FontFamily::systemSerif);
    const gfx::ShapedText rounded = gfx::shapeSystemText(
        "Rounded typography", gfx::FontFamily::systemRounded);
    if (serif.triangles.empty() || rounded.triangles.empty() ||
        serif.advance <= 0.0F || rounded.advance <= 0.0F) {
        std::cerr << "Portable native font families produced no shaped geometry\n";
        return 1;
    }
    std::ifstream fontFile("/System/Library/Fonts/Monaco.ttf", std::ios::binary);
    const std::vector<std::uint8_t> fontBytes{
        std::istreambuf_iterator<char>(fontFile), std::istreambuf_iterator<char>()};
    if (!gfx::createFontResource(77, fontBytes) || gfx::fontResourceVersion(77) == 0) {
        std::cerr << "Could not create a persistent custom font resource\n";
        return 1;
    }
    const gfx::ShapedText custom = gfx::shapeSystemText(
        "Custom font resource", gfx::FontFamily::systemSans, gfx::FontWeight::regular,
        gfx::FontStyle::regular, 0.0F, 77);
    if (custom.triangles.empty() || custom.advance <= 0.0F ||
        gfx::measureSystemText("Custom font resource", gfx::FontFamily::systemSans,
            gfx::FontWeight::regular, gfx::FontStyle::regular, 0.0F, 77) <= 0.0F) {
        std::cerr << "Custom font resource produced no shaped geometry\n";
        return 1;
    }
    gfx::destroyFontResource(77);
    if (gfx::fontResourceVersion(77) != 0) {
        std::cerr << "Custom font resource was not destroyed\n";
        return 1;
    }
    const gfx::ShapedText bold = gfx::shapeSystemText(
        "Readable", gfx::FontFamily::systemSans, gfx::FontWeight::bold);
    if (bold.triangles.empty() || bold.advance <= 0.0F) {
        std::cerr << "Bold system font produced no shaped geometry\n";
        return 1;
    }
    const gfx::ShapedText semiboldItalic = gfx::shapeSystemText(
        "Native typography", gfx::FontFamily::systemSans,
        gfx::FontWeight::semibold, gfx::FontStyle::italic);
    if (semiboldItalic.triangles.empty() || semiboldItalic.advance <= 0.0F ||
        gfx::measureSystemText("Native typography", gfx::FontFamily::systemSans,
            gfx::FontWeight::semibold, gfx::FontStyle::italic) <= 0.0F) {
        std::cerr << "Semibold italic system font produced no shaped geometry\n";
        return 1;
    }
    const float trackedAdvance = gfx::measureSystemText(
        "TRACKING", gfx::FontFamily::systemSans, gfx::FontWeight::medium,
        gfx::FontStyle::regular, 0.08F);
    const float regularAdvance = gfx::measureSystemText(
        "TRACKING", gfx::FontFamily::systemSans, gfx::FontWeight::medium);
    if (trackedAdvance <= regularAdvance) {
        std::cerr << "Letter spacing did not increase native text advance\n";
        return 1;
    }
    if (semiboldItalic.underlineThickness <= 0.0F ||
        semiboldItalic.underlinePosition <= 0.0F ||
        semiboldItalic.strikeThroughThickness <= 0.0F ||
        semiboldItalic.strikeThroughPosition <= 0.0F) {
        std::cerr << "Native text decoration metrics are invalid\n";
        return 1;
    }
    for (const gfx::PathPoint& point : sans.triangles) {
        if (!std::isfinite(point[0]) || !std::isfinite(point[1])) {
            std::cerr << "System glyph outline contains non-finite geometry\n";
            return 1;
        }
    }
    return 0;
}
