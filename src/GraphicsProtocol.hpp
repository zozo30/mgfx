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

struct ImageCommand {
    std::uint32_t textureId;
    ClipRect destination;
    ClipRect uv;
    Color tint;
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

struct TextCommand {
    FontFamily family;
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

} // namespace gfx
