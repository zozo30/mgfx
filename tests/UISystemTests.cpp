#include "UI.hpp"

#include <cmath>
#include <iostream>

namespace {

class TestComponent final : public ui::Component {
public:
    ui::Element build() override {
        ++buildCount;
        ui::Style red{{20.0F, 30.0F}, {}, 0.0F, {1.0F, 0.0F, 0.0F, 1.0F}};
        ui::Style blue{{40.0F, 30.0F}, {}, 0.0F, {0.0F, 0.0F, 1.0F, 1.0F}};
        ui::Style row{{}, {10.0F, 10.0F, 10.0F, 10.0F}, 5.0F, {}};
        red.flexGrow = 1.0F;
        blue.flexGrow = 1.0F;
        row.crossAxisAlignment = ui::CrossAxisAlignment::stretch;
        return ui::Row({
            ui::Box(red, "red", [this] {
                ++clickCount;
                invalidate();
            }),
            ui::Box(blue, "blue"),
        }, row, "root");
    }

    int clickCount = 0;
    int buildCount = 0;
};

class TextComponent final : public ui::Component {
public:
    ui::Element build() override {
        return ui::Text("A1", {14.0F, {1.0F, 1.0F, 1.0F, 1.0F}}, "text");
    }
};

class ShapeComponent final : public ui::Component {
public:
    ui::Element build() override {
        ui::Style circle{{40.0F, 40.0F}, {}, 0.0F, {0.2F, 0.8F, 0.5F, 1.0F}};
        circle.borderWidth = 4.0F;
        circle.borderColor = {0.8F, 1.0F, 0.9F, 1.0F};
        return ui::Circle(circle, "circle");
    }
};

class RoundedComponent final : public ui::Component {
public:
    ui::Element build() override {
        ui::Style style{{80.0F, 40.0F}, {}, 0.0F, {0.1F, 0.2F, 0.4F, 1.0F}};
        style.cornerRadius = 10.0F;
        style.borderWidth = 3.0F;
        style.borderColor = {0.4F, 0.7F, 1.0F, 1.0F};
        return ui::Box(style, "rounded");
    }
};

} // namespace

int main() {
    const ui::Size constrained = ui::Constraints{10.0F, 100.0F, 20.0F, 80.0F}
                                     .constrain({200.0F, 5.0F});
    if (constrained.width != 100.0F || constrained.height != 20.0F) {
        std::cerr << "Constraint clamping failed\n";
        return 1;
    }

    TestComponent component;
    ui::ComponentHost host;
    host.rebuild(component);
    host.layout({200.0F, 100.0F});
    if (host.rootBounds().size.width != 200.0F || host.rootBounds().size.height != 100.0F) {
        std::cerr << "Root did not receive the viewport bounds\n";
        return 1;
    }
    if (!host.pointerDown({20.0F, 20.0F}) || component.clickCount != 1 ||
        host.pointerDown({199.0F, 99.0F})) {
        std::cerr << "Pointer hit testing or click dispatch failed\n";
        return 1;
    }
    host.layout({200.0F, 100.0F});
    if (component.buildCount != 2) {
        std::cerr << "Component invalidation did not schedule one rebuild\n";
        return 1;
    }

    gfx::CommandEncoder encoder;
    host.paint(encoder, {200.0F, 100.0F});
    encoder.endFrame();
    const auto bytes = encoder.finish();

    gfx::CommandDecoder decoder(bytes);
    gfx::CommandView command{};
    unsigned drawCount = 0;
    float firstRectangleRight = 0.0F;
    while (decoder.next(command)) {
        if (command.opcode == gfx::Opcode::draw) {
            gfx::DrawCommand draw{};
            if (!gfx::decodeDraw(command, draw) || draw.vertices.size() != 6) {
                std::cerr << "Paint emitted an invalid rectangle mesh\n";
                return 1;
            }
            if (drawCount == 0) {
                firstRectangleRight = draw.vertices[2].position[0];
            }
            ++drawCount;
        }
    }
    if (!decoder.valid() || drawCount != 2) {
        std::cerr << "Expected one draw command per visible box\n";
        return 1;
    }
    // Content width is 180. Bases occupy 65 including the gap, leaving 115.
    // Equal flex growth adds 57.5 to the first box: right edge = 10 + 77.5.
    const float expectedRightNdc = 87.5F / 200.0F * 2.0F - 1.0F;
    if (std::fabs(firstRectangleRight - expectedRightNdc) > 0.0001F) {
        std::cerr << "Flex growth produced the wrong child width\n";
        return 1;
    }

    TextComponent textComponent;
    ui::ComponentHost textHost;
    textHost.rebuild(textComponent);
    textHost.layout({100.0F, 30.0F});
    gfx::CommandEncoder textEncoder;
    textHost.paint(textEncoder, {100.0F, 30.0F});
    textEncoder.endFrame();
    const std::vector<std::uint8_t> textBytes = textEncoder.finish();
    gfx::CommandDecoder textDecoder(textBytes);
    bool foundGlyphMesh = false;
    while (textDecoder.next(command)) {
        if (command.opcode == gfx::Opcode::draw) {
            gfx::DrawCommand glyphs{};
            foundGlyphMesh = gfx::decodeDraw(command, glyphs) && glyphs.vertices.size() > 6;
        }
    }
    if (!textDecoder.valid() || !foundGlyphMesh) {
        std::cerr << "Text did not emit a batched glyph mesh\n";
        return 1;
    }


    ShapeComponent shapeComponent;
    ui::ComponentHost shapeHost;
    shapeHost.rebuild(shapeComponent);
    shapeHost.layout({40.0F, 40.0F});
    gfx::CommandEncoder shapeEncoder;
    shapeHost.paint(shapeEncoder, {40.0F, 40.0F});
    shapeEncoder.endFrame();
    const std::vector<std::uint8_t> shapeBytes = shapeEncoder.finish();
    gfx::CommandDecoder shapeDecoder(shapeBytes);
    bool foundFill = false;
    bool foundRing = false;
    while (shapeDecoder.next(command)) {
        if (command.opcode == gfx::Opcode::draw) {
            gfx::DrawCommand shape{};
            if (gfx::decodeDraw(command, shape)) {
                foundFill = foundFill || shape.vertices.size() == 32U * 3U;
                foundRing = foundRing || shape.vertices.size() == 32U * 6U;
            }
        }
    }
    if (!shapeDecoder.valid() || !foundFill || !foundRing) {
        std::cerr << "Circle fill or border did not emit a tessellated mesh\n";
        return 1;
    }

    RoundedComponent roundedComponent;
    ui::ComponentHost roundedHost;
    roundedHost.rebuild(roundedComponent);
    roundedHost.layout({80.0F, 40.0F});
    gfx::CommandEncoder roundedEncoder;
    roundedHost.paint(roundedEncoder, {80.0F, 40.0F});
    roundedEncoder.endFrame();
    const std::vector<std::uint8_t> roundedBytes = roundedEncoder.finish();
    gfx::CommandDecoder roundedDecoder(roundedBytes);
    unsigned roundedDraws = 0;
    while (roundedDecoder.next(command)) {
        if (command.opcode == gfx::Opcode::draw) ++roundedDraws;
    }
    if (!roundedDecoder.valid() || roundedDraws != 2) {
        std::cerr << "Rounded rectangle fill and border were not both emitted\n";
        return 1;
    }
    return 0;
}
