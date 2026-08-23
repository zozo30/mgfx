#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace gfx {

inline constexpr std::uint16_t protocolVersion = 1;

enum class Opcode : std::uint16_t {
    clear = 1,
    draw = 2,
    endFrame = 3,
    pushClip = 4,
    popClip = 5,
    drawImage = 6,
    drawPath = 7,
    drawText = 8,
    pushTransform = 9,
    popTransform = 10,
    pushOpacity = 11,
    popOpacity = 12,
    drawShadow = 13,
    drawRadialGradient = 14,
    drawRoundedRect = 15,
};

enum class Primitive : std::uint8_t {
    triangleList = 1,
};

struct Color {
    float red;
    float green;
    float blue;
    float alpha;
};

struct Vertex {
    std::array<float, 2> position;
    std::array<float, 4> color;
};

struct CommandView {
    Opcode opcode;
    const std::uint8_t* payload;
    std::uint32_t payloadSize;
};

struct DrawCommand {
    Primitive primitive;
    std::vector<Vertex> vertices;
};

struct ClipRect {
    float left;
    float top;
    float right;
    float bottom;
};

struct AffineTransform {
    float m11;
    float m12;
    float m21;
    float m22;
    float translateX;
    float translateY;
};

struct ImageCommand {
    std::uint32_t textureId;
    ClipRect destination;
    ClipRect uv;
    Color tint;
};

struct ShadowCommand {
    ClipRect destination;
    float cornerRadius;
    float blur;
    float spread;
    Color color;
};

struct RadialGradientCommand {
    ClipRect destination;
    float centerX;
    float centerY;
    float radius;
    float cornerRadius;
    Color innerColor;
    Color outerColor;
};

struct RoundedRectCommand {
    ClipRect destination;
    float cornerRadius;
    float borderWidth;
    Color fillColor;
    Color borderColor;
};

enum class FillRule : std::uint8_t { nonzero = 0, evenodd = 1 };
enum class LineCap : std::uint8_t { butt = 0, round = 1 };
enum class LineJoin : std::uint8_t { bevel = 0, round = 1 };

struct PathRect {
    float x;
    float y;
    float width;
    float height;
};

struct PathGradient {
    float startX;
    float startY;
    float endX;
    float endY;
    Color startColor;
    Color endColor;
};

struct PathCommand {
    std::uint32_t pathId;
    bool fill;
    bool stroke;
    FillRule fillRule;
    LineCap lineCap;
    LineJoin lineJoin;
    float strokeWidth;
    float tolerance;
    ClipRect destination;
    PathRect viewBox;
    Color fillColor;
    Color strokeColor;
    bool fillGradient = false;
    PathGradient gradient{};
};

enum class FontFamily : std::uint8_t { systemSans = 0, systemMonospace = 1 };
enum class FontWeight : std::uint8_t { regular = 0, bold = 1 };

struct TextCommand {
    FontFamily family;
    FontWeight weight;
    float left;
    float top;
    float fontSize;
    Color color;
    std::string text;
};

class CommandEncoder final {
public:
    CommandEncoder();

    void clear(Color color);
    void draw(Primitive primitive, const Vertex* vertices, std::uint32_t vertexCount);
    void endFrame();
    void pushClip(ClipRect clip);
    void popClip();
    void drawImage(const ImageCommand& image);
    void drawPath(const PathCommand& path);
    void drawText(const TextCommand& text);
    void pushTransform(AffineTransform transform);
    void popTransform();
    void pushOpacity(float opacity);
    void popOpacity();
    void drawShadow(const ShadowCommand& shadow);
    void drawRadialGradient(const RadialGradientCommand& gradient);
    void drawRoundedRect(const RoundedRectCommand& rectangle);

    std::vector<std::uint8_t> finish();

private:
    void beginCommand(Opcode opcode, std::uint32_t payloadSize);

    std::vector<std::uint8_t> bytes_;
    std::uint32_t commandCount_ = 0;
    bool finished_ = false;
};

class CommandDecoder final {
public:
    explicit CommandDecoder(const std::vector<std::uint8_t>& bytes);
    CommandDecoder(std::vector<std::uint8_t>&&) = delete;

    bool next(CommandView& command);
    bool valid() const { return error_.empty(); }
    const std::string& error() const { return error_; }

private:
    const std::vector<std::uint8_t>& bytes_;
    std::size_t offset_ = 0;
    std::uint32_t commandsRemaining_ = 0;
    std::string error_;
};

bool decodeClear(const CommandView& command, Color& color);
bool decodeDraw(const CommandView& command, DrawCommand& draw);
bool decodePushClip(const CommandView& command, ClipRect& clip);
bool decodeImage(const CommandView& command, ImageCommand& image);
bool decodePath(const CommandView& command, PathCommand& path);
bool decodeText(const CommandView& command, TextCommand& text);
bool decodePushTransform(const CommandView& command, AffineTransform& transform);
bool decodePushOpacity(const CommandView& command, float& opacity);
bool decodeShadow(const CommandView& command, ShadowCommand& shadow);
bool decodeRadialGradient(const CommandView& command, RadialGradientCommand& gradient);
bool decodeRoundedRect(const CommandView& command, RoundedRectCommand& rectangle);

} // namespace gfx
