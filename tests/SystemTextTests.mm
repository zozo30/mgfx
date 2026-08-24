#include "SystemText.hpp"
#include "ResourceBudget.hpp"
#include "TextGeometryCache.hpp"

#include <cmath>
#include <fstream>
#include <iostream>
#include <iterator>

int main() {
    gfx::ResourceBudget resourceBudget(2, 10);
    if (!resourceBudget.commit(1, 6) || !resourceBudget.commit(2, 4) ||
        resourceBudget.wouldAccept(3, 1) || !resourceBudget.commit(1, 5) ||
        resourceBudget.cost() != 9 || resourceBudget.wouldAccept(1, 7) ||
        resourceBudget.cost() != 9) {
        std::cerr << "Persistent resource budget replacement accounting failed\n";
        return 1;
    }
    resourceBudget.remove(2);
    if (!resourceBudget.commit(3, 5) || resourceBudget.resources() != 2 ||
        resourceBudget.cost() != 10) {
        std::cerr << "Persistent resource budget did not release destroyed capacity\n";
        return 1;
    }
    resourceBudget.clear();
    if (resourceBudget.resources() != 0 || resourceBudget.cost() != 0) {
        std::cerr << "Persistent resource budget did not clear on disconnect\n";
        return 1;
    }
    gfx::TextGeometryCache cache(2, 9);
    int factories = 0;
    const auto cachedShape = [&](const char* key, std::size_t points) -> gfx::ShapedText& {
        return cache.getOrCreate(key, [&]() {
            ++factories;
            gfx::ShapedText shaped;
            shaped.triangles.resize(points);
            return shaped;
        });
    };
    cachedShape("a", 3); cachedShape("b", 3); cachedShape("a", 3); cachedShape("c", 3);
    cache.trim();
    auto cacheStats = cache.stats();
    if (cacheStats.entries != 2 || cacheStats.points != 6 || cacheStats.hits != 1 ||
        cacheStats.misses != 3 || cacheStats.evictions != 1 || factories != 3) {
        std::cerr << "Text geometry LRU did not retain the most recently used entries\n";
        return 1;
    }
    cachedShape("b", 3); cache.trim();
    cacheStats = cache.stats();
    if (cacheStats.entries != 2 || cacheStats.misses != 4 || cacheStats.evictions != 2 ||
        factories != 4) {
        std::cerr << "Evicted text geometry did not rebuild deterministically\n";
        return 1;
    }
    gfx::TextGeometryCache pointBudget(10, 5);
    pointBudget.getOrCreate("small", [] { gfx::ShapedText value; value.triangles.resize(4); return value; });
    pointBudget.getOrCreate("large", [] { gfx::ShapedText value; value.triangles.resize(8); return value; });
    pointBudget.trim();
    if (pointBudget.stats().entries != 1 || pointBudget.stats().points != 8 ||
        pointBudget.stats().evictions != 1) {
        std::cerr << "Text point budget did not retain one oversized newest entry\n";
        return 1;
    }
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
