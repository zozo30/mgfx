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
    drawCircle = 16,
    drawDiagonalPattern = 17,
    drawLinearGradient = 18,
    drawImageSurface = 19,
    drawDotGrid = 20,
    drawWaveDots = 21,
    drawMesh = 22,
    drawConicGradient = 23,
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

enum class ImageSampling : std::uint8_t { linear = 0, nearest = 1 };

struct ImageSurfaceCommand {
    std::uint32_t textureId;
    ImageSampling sampling;
    ClipRect destination;
    ClipRect uv;
    Color tint;
    float cornerRadius;
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

struct CircleCommand {
    ClipRect destination;
    float borderWidth;
    Color fillColor;
    Color borderColor;
};

struct DiagonalPatternCommand {
    ClipRect destination;
    float stripeWidth;
    float gap;
    float offset;
    bool backward;
    Color color;
};

enum class GradientDirection : std::uint8_t { horizontal = 0, vertical = 1, diagonal = 2 };

struct LinearGradientCommand {
    ClipRect destination;
    float cornerRadius;
    GradientDirection direction;
    Color startColor;
    Color endColor;
};

struct ConicGradientCommand {
    ClipRect destination;
    float centerX;
    float centerY;
    float rotation;
    float cornerRadius;
    Color startColor;
    Color middleColor;
    Color endColor;
};

struct DotGridCommand {
    ClipRect destination;
    std::uint32_t rows;
    std::uint32_t columns;
    std::uint32_t filledMask;
    std::int32_t activeIndex;
    float inset;
    float radius;
    float borderWidth;
    Color fillColor;
    Color ringColor;
    Color highlightColor;
};

struct WaveDotsCommand {
    ClipRect destination;
    std::uint32_t count;
    float inset;
    float minimumRadius;
    float maximumRadius;
    float phase;
    float frequency;
    float borderWidth;
    Color troughStartColor;
    Color troughEndColor;
    Color crestStartColor;
    Color crestEndColor;
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

struct MeshCommand {
    std::uint32_t meshId;
    ClipRect destination;
    PathRect viewBox;
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
enum class FontWeight : std::uint8_t { regular = 0, bold = 1, medium = 2, semibold = 3 };
enum class FontStyle : std::uint8_t { regular = 0, italic = 1 };
enum TextDecoration : std::uint8_t {
    noTextDecoration = 0,
    underlineText = 1U << 0U,
    strikeThroughText = 1U << 1U,
};

struct TextCommand {
    FontFamily family;
    FontWeight weight;
    FontStyle style;
    float letterSpacing;
    std::uint8_t decoration;
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
    void drawImageSurface(const ImageSurfaceCommand& image);
    void drawMesh(const MeshCommand& mesh);
    void drawPath(const PathCommand& path);
    void drawText(const TextCommand& text);
    void pushTransform(AffineTransform transform);
    void popTransform();
    void pushOpacity(float opacity);
    void popOpacity();
    void drawShadow(const ShadowCommand& shadow);
    void drawRadialGradient(const RadialGradientCommand& gradient);
    void drawRoundedRect(const RoundedRectCommand& rectangle);
    void drawCircle(const CircleCommand& circle);
    void drawDiagonalPattern(const DiagonalPatternCommand& pattern);
    void drawLinearGradient(const LinearGradientCommand& gradient);
    void drawDotGrid(const DotGridCommand& grid);
    void drawConicGradient(const ConicGradientCommand& gradient);
    void drawWaveDots(const WaveDotsCommand& wave);

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
bool decodeImageSurface(const CommandView& command, ImageSurfaceCommand& image);
bool decodeMesh(const CommandView& command, MeshCommand& mesh);
bool decodePath(const CommandView& command, PathCommand& path);
bool decodeText(const CommandView& command, TextCommand& text);
bool decodePushTransform(const CommandView& command, AffineTransform& transform);
bool decodePushOpacity(const CommandView& command, float& opacity);
bool decodeShadow(const CommandView& command, ShadowCommand& shadow);
bool decodeRadialGradient(const CommandView& command, RadialGradientCommand& gradient);
bool decodeRoundedRect(const CommandView& command, RoundedRectCommand& rectangle);
bool decodeCircle(const CommandView& command, CircleCommand& circle);
bool decodeDiagonalPattern(const CommandView& command, DiagonalPatternCommand& pattern);
bool decodeLinearGradient(const CommandView& command, LinearGradientCommand& gradient);
bool decodeDotGrid(const CommandView& command, DotGridCommand& grid);
bool decodeConicGradient(const CommandView& command, ConicGradientCommand& gradient);
bool decodeWaveDots(const CommandView& command, WaveDotsCommand& wave);

} // namespace gfx
