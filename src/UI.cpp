#include "UI.hpp"

#include "GraphicsProtocol.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cmath>
#include <memory>
#include <stdexcept>
#include <utility>

namespace ui {
namespace {

using Glyph = std::array<std::uint8_t, 7>;

Glyph glyphFor(char character) {
    switch (character) {
    case 'A': return {14, 17, 17, 31, 17, 17, 17};
    case 'B': return {30, 17, 17, 30, 17, 17, 30};
    case 'C': return {14, 17, 16, 16, 16, 17, 14};
    case 'D': return {30, 17, 17, 17, 17, 17, 30};
    case 'E': return {31, 16, 16, 30, 16, 16, 31};
    case 'F': return {31, 16, 16, 30, 16, 16, 16};
    case 'G': return {14, 17, 16, 23, 17, 17, 15};
    case 'H': return {17, 17, 17, 31, 17, 17, 17};
    case 'I': return {14, 4, 4, 4, 4, 4, 14};
    case 'J': return {7, 2, 2, 2, 18, 18, 12};
    case 'K': return {17, 18, 20, 24, 20, 18, 17};
    case 'L': return {16, 16, 16, 16, 16, 16, 31};
    case 'M': return {17, 27, 21, 21, 17, 17, 17};
    case 'N': return {17, 25, 21, 19, 17, 17, 17};
    case 'O': return {14, 17, 17, 17, 17, 17, 14};
    case 'P': return {30, 17, 17, 30, 16, 16, 16};
    case 'Q': return {14, 17, 17, 17, 21, 18, 13};
    case 'R': return {30, 17, 17, 30, 20, 18, 17};
    case 'S': return {15, 16, 16, 14, 1, 1, 30};
    case 'T': return {31, 4, 4, 4, 4, 4, 4};
    case 'U': return {17, 17, 17, 17, 17, 17, 14};
    case 'V': return {17, 17, 17, 17, 17, 10, 4};
    case 'W': return {17, 17, 17, 21, 21, 21, 10};
    case 'X': return {17, 17, 10, 4, 10, 17, 17};
    case 'Y': return {17, 17, 10, 4, 4, 4, 4};
    case 'Z': return {31, 1, 2, 4, 8, 16, 31};
    case '0': return {14, 17, 19, 21, 25, 17, 14};
    case '1': return {4, 12, 4, 4, 4, 4, 14};
    case '2': return {14, 17, 1, 2, 4, 8, 31};
    case '3': return {30, 1, 1, 14, 1, 1, 30};
    case '4': return {2, 6, 10, 18, 31, 2, 2};
    case '5': return {31, 16, 16, 30, 1, 1, 30};
    case '6': return {14, 16, 16, 30, 17, 17, 14};
    case '7': return {31, 1, 2, 4, 8, 8, 8};
    case '8': return {14, 17, 17, 14, 17, 17, 14};
    case '9': return {14, 17, 17, 15, 1, 1, 14};
    case '-': return {0, 0, 0, 31, 0, 0, 0};
    case ' ': return {};
    default: return {31, 17, 1, 2, 4, 0, 4};
    }
}

bool sameConstraints(const Constraints& left, const Constraints& right) {
    return left.minWidth == right.minWidth && left.maxWidth == right.maxWidth &&
           left.minHeight == right.minHeight && left.maxHeight == right.maxHeight;
}

bool contains(Rect rectangle, Point point) {
    return point.x >= rectangle.origin.x && point.y >= rectangle.origin.y &&
           point.x < rectangle.origin.x + rectangle.size.width &&
           point.y < rectangle.origin.y + rectangle.size.height;
}

float innerExtent(float extent, float before, float after) {
    return std::max(0.0F, extent - before - after);
}

Constraints childConstraints(const Constraints& outer, const Insets& padding) {
    return {
        0.0F,
        innerExtent(outer.maxWidth, padding.left, padding.right),
        0.0F,
        innerExtent(outer.maxHeight, padding.top, padding.bottom),
    };
}

class PaintContext final {
public:
    PaintContext(gfx::CommandEncoder& encoder, Size viewport)
        : encoder_(encoder), viewport_(viewport) {}

    void fillRect(Rect rectangle, gfx::Color color) {
        if (rectangle.size.width <= 0.0F || rectangle.size.height <= 0.0F ||
            viewport_.width <= 0.0F || viewport_.height <= 0.0F || color.alpha <= 0.0F) {
            return;
        }

        std::vector<gfx::Vertex> vertices;
        vertices.reserve(6);
        appendRectangle(vertices, rectangle, color);
        encoder_.draw(gfx::Primitive::triangleList, vertices.data(),
                      static_cast<std::uint32_t>(vertices.size()));
    }

    void drawText(Point origin, const std::string& text, TextStyle style) {
        if (text.empty() || style.fontSize <= 0.0F || style.color.alpha <= 0.0F) {
            return;
        }
        const float cell = style.fontSize / 7.0F;
        const float advance = cell * 6.0F;
        std::vector<gfx::Vertex> vertices;
        vertices.reserve(text.size() * 7 * 5 * 6);

        float glyphX = origin.x;
        for (char character : text) {
            const Glyph glyph = glyphFor(character >= 'a' && character <= 'z'
                                             ? static_cast<char>(character - 'a' + 'A')
                                             : character);
            for (std::size_t row = 0; row < glyph.size(); ++row) {
                for (std::size_t column = 0; column < 5; ++column) {
                    if ((glyph[row] & (1U << (4U - column))) != 0) {
                        appendRectangle(vertices,
                                        {{glyphX + static_cast<float>(column) * cell,
                                          origin.y + static_cast<float>(row) * cell},
                                         {cell, cell}},
                                        style.color);
                    }
                }
            }
            glyphX += advance;
        }
        if (!vertices.empty()) {
            encoder_.draw(gfx::Primitive::triangleList, vertices.data(),
                          static_cast<std::uint32_t>(vertices.size()));
        }
    }

    void strokeRect(Rect rectangle, float width, gfx::Color color) {
        width = std::min({width, rectangle.size.width * 0.5F, rectangle.size.height * 0.5F});
        if (width <= 0.0F || color.alpha <= 0.0F) return;
        fillRect({rectangle.origin, {rectangle.size.width, width}}, color);
        fillRect({{rectangle.origin.x, rectangle.origin.y + rectangle.size.height - width},
                  {rectangle.size.width, width}}, color);
        fillRect({{rectangle.origin.x, rectangle.origin.y + width},
                  {width, rectangle.size.height - width * 2.0F}}, color);
        fillRect({{rectangle.origin.x + rectangle.size.width - width, rectangle.origin.y + width},
                  {width, rectangle.size.height - width * 2.0F}}, color);
    }

    void drawCircle(Rect rectangle, gfx::Color fill, float borderWidth, gfx::Color border) {
        constexpr std::size_t segments = 32;
        const float radius = std::min(rectangle.size.width, rectangle.size.height) * 0.5F;
        if (radius <= 0.0F) return;
        const Point center{rectangle.origin.x + rectangle.size.width * 0.5F,
                           rectangle.origin.y + rectangle.size.height * 0.5F};
        if (fill.alpha > 0.0F) {
            std::vector<gfx::Vertex> vertices;
            vertices.reserve(segments * 3);
            for (std::size_t index = 0; index < segments; ++index) {
                appendTriangleFanSegment(vertices, center, radius,
                                         index, segments, fill);
            }
            encoder_.draw(gfx::Primitive::triangleList, vertices.data(),
                          static_cast<std::uint32_t>(vertices.size()));
        }
        const float innerRadius = std::max(0.0F, radius - borderWidth);
        if (border.alpha > 0.0F && borderWidth > 0.0F) {
            std::vector<gfx::Vertex> vertices;
            vertices.reserve(segments * 6);
            for (std::size_t index = 0; index < segments; ++index) {
                appendRingSegment(vertices, center, innerRadius, radius,
                                  index, segments, border);
            }
            encoder_.draw(gfx::Primitive::triangleList, vertices.data(),
                          static_cast<std::uint32_t>(vertices.size()));
        }
    }

    void drawRoundedRect(Rect rectangle, float requestedRadius, gfx::Color fill,
                         float requestedBorderWidth, gfx::Color border) {
        constexpr std::size_t points = 32;
        const float radius = std::min({requestedRadius, rectangle.size.width * 0.5F,
                                       rectangle.size.height * 0.5F});
        if (radius <= 0.0F) {
            fillRect(rectangle, fill);
            strokeRect(rectangle, requestedBorderWidth, border);
            return;
        }
        const Point center{rectangle.origin.x + rectangle.size.width * 0.5F,
                           rectangle.origin.y + rectangle.size.height * 0.5F};
        if (fill.alpha > 0.0F) {
            std::vector<gfx::Vertex> vertices;
            vertices.reserve(points * 3);
            for (std::size_t index = 0; index < points; ++index) {
                vertices.insert(vertices.end(), {
                    vertex(center, fill), vertex(roundedPoint(rectangle, radius, index), fill),
                    vertex(roundedPoint(rectangle, radius, index + 1), fill)});
            }
            encoder_.draw(gfx::Primitive::triangleList, vertices.data(),
                          static_cast<std::uint32_t>(vertices.size()));
        }
        const float width = std::min({requestedBorderWidth, rectangle.size.width * 0.5F,
                                      rectangle.size.height * 0.5F});
        if (border.alpha > 0.0F && width > 0.0F) {
            const Rect inner{{rectangle.origin.x + width, rectangle.origin.y + width},
                             {rectangle.size.width - width * 2.0F,
                              rectangle.size.height - width * 2.0F}};
            const float innerRadius = std::max(0.0F, radius - width);
            std::vector<gfx::Vertex> vertices;
            vertices.reserve(points * 6);
            for (std::size_t index = 0; index < points; ++index) {
                const Point outerA = roundedPoint(rectangle, radius, index);
                const Point outerB = roundedPoint(rectangle, radius, index + 1);
                const Point innerA = inner.size.width <= 0.0F || inner.size.height <= 0.0F
                                         ? center : roundedPoint(inner, innerRadius, index);
                const Point innerB = inner.size.width <= 0.0F || inner.size.height <= 0.0F
                                         ? center : roundedPoint(inner, innerRadius, index + 1);
                vertices.insert(vertices.end(), {
                    vertex(outerA, border), vertex(innerA, border), vertex(innerB, border),
                    vertex(outerA, border), vertex(innerB, border), vertex(outerB, border)});
            }
            encoder_.draw(gfx::Primitive::triangleList, vertices.data(),
                          static_cast<std::uint32_t>(vertices.size()));
        }
    }

    void pushClip(Rect rectangle) {
        if (viewport_.width <= 0.0F || viewport_.height <= 0.0F) return;
        encoder_.pushClip({rectangle.origin.x / viewport_.width,
                           rectangle.origin.y / viewport_.height,
                           (rectangle.origin.x + rectangle.size.width) / viewport_.width,
                           (rectangle.origin.y + rectangle.size.height) / viewport_.height});
    }

    void popClip() { encoder_.popClip(); }

private:
    Point circlePoint(Point center, float radius, std::size_t index, std::size_t segments) const {
        constexpr float pi = 3.14159265358979323846F;
        const float angle = static_cast<float>(index) / static_cast<float>(segments) * 2.0F * pi;
        return {center.x + std::cos(angle) * radius, center.y + std::sin(angle) * radius};
    }

    Point roundedPoint(Rect rectangle, float radius, std::size_t index) const {
        constexpr std::size_t segmentsPerCorner = 8;
        constexpr std::size_t pointCount = segmentsPerCorner * 4;
        constexpr float pi = 3.14159265358979323846F;
        index %= pointCount;
        const std::size_t corner = index / segmentsPerCorner;
        const std::size_t segment = index % segmentsPerCorner;
        const float startAngles[] = {pi, pi * 1.5F, 0.0F, pi * 0.5F};
        const Point centers[] = {
            {rectangle.origin.x + radius, rectangle.origin.y + radius},
            {rectangle.origin.x + rectangle.size.width - radius, rectangle.origin.y + radius},
            {rectangle.origin.x + rectangle.size.width - radius,
             rectangle.origin.y + rectangle.size.height - radius},
            {rectangle.origin.x + radius, rectangle.origin.y + rectangle.size.height - radius},
        };
        const float angle = startAngles[corner] +
                            static_cast<float>(segment) / static_cast<float>(segmentsPerCorner) *
                                pi * 0.5F;
        return {centers[corner].x + std::cos(angle) * radius,
                centers[corner].y + std::sin(angle) * radius};
    }

    gfx::Vertex vertex(Point point, gfx::Color color) const {
        return {{point.x / viewport_.width * 2.0F - 1.0F,
                 1.0F - point.y / viewport_.height * 2.0F},
                {color.red, color.green, color.blue, color.alpha}};
    }

    void appendTriangleFanSegment(std::vector<gfx::Vertex>& vertices, Point center, float radius,
                                  std::size_t index, std::size_t segments, gfx::Color color) const {
        vertices.push_back(vertex(center, color));
        vertices.push_back(vertex(circlePoint(center, radius, index, segments), color));
        vertices.push_back(vertex(circlePoint(center, radius, index + 1, segments), color));
    }

    void appendRingSegment(std::vector<gfx::Vertex>& vertices, Point center,
                           float inner, float outer, std::size_t index,
                           std::size_t segments, gfx::Color color) const {
        const Point outerA = circlePoint(center, outer, index, segments);
        const Point outerB = circlePoint(center, outer, index + 1, segments);
        const Point innerA = circlePoint(center, inner, index, segments);
        const Point innerB = circlePoint(center, inner, index + 1, segments);
        vertices.insert(vertices.end(), {vertex(outerA, color), vertex(innerA, color), vertex(innerB, color),
                                         vertex(outerA, color), vertex(innerB, color), vertex(outerB, color)});
    }

    void appendRectangle(std::vector<gfx::Vertex>& vertices,
                         Rect rectangle,
                         gfx::Color color) const {
        const float left = rectangle.origin.x / viewport_.width * 2.0F - 1.0F;
        const float right = (rectangle.origin.x + rectangle.size.width) /
                                viewport_.width * 2.0F -
                            1.0F;
        const float top = 1.0F - rectangle.origin.y / viewport_.height * 2.0F;
        const float bottom = 1.0F - (rectangle.origin.y + rectangle.size.height) /
                                        viewport_.height * 2.0F;
        const std::array<float, 4> vertexColor{
            color.red, color.green, color.blue, color.alpha};
        const gfx::Vertex rectangleVertices[] = {
            {{left, top}, vertexColor},
            {{left, bottom}, vertexColor},
            {{right, bottom}, vertexColor},
            {{left, top}, vertexColor},
            {{right, bottom}, vertexColor},
            {{right, top}, vertexColor},
        };
        vertices.insert(vertices.end(), std::begin(rectangleVertices), std::end(rectangleVertices));
    }
    gfx::CommandEncoder& encoder_;
    Size viewport_;
};

} // namespace

class LayoutNode final {
public:
    explicit LayoutNode(const Element& element) : type_(element.type), key_(element.key) {
        update(element);
    }

    bool matches(const Element& element) const {
        return type_ == element.type && key_ == element.key;
    }

    void update(const Element& element) {
        type_ = element.type;
        key_ = element.key;
        style_ = element.style;
        onClick_ = element.onClick;
        text_ = element.text;
        textStyle_ = element.textStyle;

        std::vector<std::unique_ptr<LayoutNode>> oldChildren = std::move(children_);
        std::vector<bool> used(oldChildren.size(), false);
        children_.reserve(element.children.size());

        for (std::size_t index = 0; index < element.children.size(); ++index) {
            const Element& childElement = element.children[index];
            std::size_t match = oldChildren.size();

            if (!childElement.key.empty()) {
                for (std::size_t candidate = 0; candidate < oldChildren.size(); ++candidate) {
                    if (match == oldChildren.size() && !used[candidate] &&
                        oldChildren[candidate] &&
                        oldChildren[candidate]->matches(childElement)) {
                        match = candidate;
                    }
                }
            } else if (index < oldChildren.size() && !used[index] && oldChildren[index] &&
                       oldChildren[index]->matches(childElement)) {
                match = index;
            }

            if (match != oldChildren.size()) {
                used[match] = true;
                oldChildren[match]->update(childElement);
                children_.push_back(std::move(oldChildren[match]));
            } else {
                children_.push_back(std::make_unique<LayoutNode>(childElement));
            }
        }

        measureDirty_ = true;
    }

    Size measure(const Constraints& constraints) {
        if (!measureDirty_ && sameConstraints(constraints, lastConstraints_)) {
            return measuredSize_;
        }

        const Constraints inner = childConstraints(constraints, style_.padding);
        Size content{};
        if (type_ == ElementType::text && !text_.empty()) {
            const float cell = textStyle_.fontSize / 7.0F;
            content.width = static_cast<float>(text_.size()) * cell * 6.0F - cell;
            content.height = textStyle_.fontSize;
        }
        const float gapCount = children_.empty()
                                   ? 0.0F
                                   : static_cast<float>(children_.size() - 1);

        for (auto& child : children_) {
            const Size childSize = child->measure(inner);
            if (type_ == ElementType::row) {
                content.width += childSize.width;
                content.height = std::max(content.height, childSize.height);
            } else if (type_ == ElementType::column) {
                content.width = std::max(content.width, childSize.width);
                content.height += childSize.height;
            } else {
                content.width = std::max(content.width, childSize.width);
                content.height = std::max(content.height, childSize.height);
            }
        }

        if (type_ == ElementType::row) {
            content.width += style_.gap * gapCount;
        } else if (type_ == ElementType::column) {
            content.height += style_.gap * gapCount;
        }

        Size desired{
            std::max(style_.preferredSize.width,
                     content.width + style_.padding.left + style_.padding.right),
            std::max(style_.preferredSize.height,
                     content.height + style_.padding.top + style_.padding.bottom),
        };
        measuredSize_ = constraints.constrain(desired);
        lastConstraints_ = constraints;
        measureDirty_ = false;
        return measuredSize_;
    }

    void layout(Rect bounds) {
        bounds_ = bounds;
        const Rect content{
            {bounds.origin.x + style_.padding.left, bounds.origin.y + style_.padding.top},
            {innerExtent(bounds.size.width, style_.padding.left, style_.padding.right),
             innerExtent(bounds.size.height, style_.padding.top, style_.padding.bottom)},
        };

        const bool horizontal = type_ == ElementType::row;
        const bool vertical = type_ == ElementType::column;
        const bool linear = horizontal || vertical;
        const float availableMain = horizontal ? content.size.width : content.size.height;
        float occupiedMain = 0.0F;
        float totalFlex = 0.0F;
        for (const auto& child : children_) {
            occupiedMain += horizontal ? child->measuredSize_.width : child->measuredSize_.height;
            totalFlex += std::max(0.0F, child->style_.flexGrow);
        }
        const float baseGapTotal = linear && !children_.empty()
                                       ? style_.gap * static_cast<float>(children_.size() - 1)
                                       : 0.0F;
        occupiedMain += baseGapTotal;
        const float remainingMain = linear ? std::max(0.0F, availableMain - occupiedMain) : 0.0F;

        float leadingSpace = 0.0F;
        float effectiveGap = style_.gap;
        if (linear && totalFlex == 0.0F) {
            if (style_.mainAxisAlignment == MainAxisAlignment::center) {
                leadingSpace = remainingMain * 0.5F;
            } else if (style_.mainAxisAlignment == MainAxisAlignment::end) {
                leadingSpace = remainingMain;
            } else if (style_.mainAxisAlignment == MainAxisAlignment::spaceBetween &&
                       children_.size() > 1) {
                effectiveGap += remainingMain / static_cast<float>(children_.size() - 1);
            }
        }

        float cursorX = content.origin.x + (horizontal ? leadingSpace : 0.0F);
        float cursorY = content.origin.y + (vertical ? leadingSpace : 0.0F);
        for (auto& child : children_) {
            Size childSize = child->measuredSize_;
            if (linear && totalFlex > 0.0F && child->style_.flexGrow > 0.0F) {
                const float extra = remainingMain * child->style_.flexGrow / totalFlex;
                if (horizontal) {
                    childSize.width += extra;
                } else {
                    childSize.height += extra;
                }
            }
            childSize.width = std::min(childSize.width, content.size.width);
            childSize.height = std::min(childSize.height, content.size.height);

            Point origin = content.origin;
            if (horizontal) {
                origin.x = cursorX;
                if (style_.crossAxisAlignment == CrossAxisAlignment::center) {
                    origin.y += (content.size.height - childSize.height) * 0.5F;
                } else if (style_.crossAxisAlignment == CrossAxisAlignment::end) {
                    origin.y += content.size.height - childSize.height;
                } else if (style_.crossAxisAlignment == CrossAxisAlignment::stretch) {
                    childSize.height = content.size.height;
                }
                cursorX += childSize.width + effectiveGap;
            } else if (vertical) {
                origin.y = cursorY;
                if (style_.crossAxisAlignment == CrossAxisAlignment::center) {
                    origin.x += (content.size.width - childSize.width) * 0.5F;
                } else if (style_.crossAxisAlignment == CrossAxisAlignment::end) {
                    origin.x += content.size.width - childSize.width;
                } else if (style_.crossAxisAlignment == CrossAxisAlignment::stretch) {
                    childSize.width = content.size.width;
                }
                cursorY += childSize.height + effectiveGap;
            }
            child->layout({origin, childSize});
        }
    }

    void paint(PaintContext& context) const {
        if (style_.clip) context.pushClip(bounds_);
        if (type_ == ElementType::circle) {
            context.drawCircle(bounds_, style_.background, style_.borderWidth, style_.borderColor);
        } else if (style_.cornerRadius > 0.0F) {
            context.drawRoundedRect(bounds_, style_.cornerRadius, style_.background,
                                    style_.borderWidth, style_.borderColor);
        } else {
            context.fillRect(bounds_, style_.background);
            context.strokeRect(bounds_, style_.borderWidth, style_.borderColor);
        }
        if (type_ == ElementType::text) {
            context.drawText(bounds_.origin, text_, textStyle_);
        }
        for (const auto& child : children_) {
            child->paint(context);
        }
        if (style_.clip) context.popClip();
    }

    bool pointerDown(Point point) {
        if (!contains(bounds_, point)) {
            return false;
        }
        for (auto child = children_.rbegin(); child != children_.rend(); ++child) {
            if ((*child)->pointerDown(point)) {
                return true;
            }
        }
        if (onClick_) {
            onClick_();
            return true;
        }
        return false;
    }

    Rect bounds() const { return bounds_; }

private:
    ElementType type_;
    std::string key_;
    Style style_;
    std::vector<std::unique_ptr<LayoutNode>> children_;
    Constraints lastConstraints_{};
    Size measuredSize_{};
    Rect bounds_{};
    bool measureDirty_ = true;
    std::function<void()> onClick_;
    std::string text_;
    TextStyle textStyle_{};
};

Size Constraints::constrain(Size desired) const {
    const float legalMaxWidth = std::max(minWidth, maxWidth);
    const float legalMaxHeight = std::max(minHeight, maxHeight);
    return {
        std::clamp(desired.width, minWidth, legalMaxWidth),
        std::clamp(desired.height, minHeight, legalMaxHeight),
    };
}

Element Box(Style style, std::string key, std::function<void()> onClick) {
    return {ElementType::box, std::move(key), style, {}, std::move(onClick), {}, {}};
}

Element Row(std::vector<Element> children, Style style, std::string key) {
    return {ElementType::row, std::move(key), style, std::move(children), {}, {}, {}};
}

Element Column(std::vector<Element> children, Style style, std::string key) {
    return {ElementType::column, std::move(key), style, std::move(children), {}, {}, {}};
}

Element Stack(std::vector<Element> children, Style style, std::string key) {
    return {ElementType::stack, std::move(key), style, std::move(children), {}, {}, {}};
}

Element Text(std::string text, TextStyle style, std::string key) {
    return {ElementType::text, std::move(key), {}, {}, {}, std::move(text), style};
}

Element Circle(Style style, std::string key) {
    return {ElementType::circle, std::move(key), style, {}, {}, {}, {}};
}

Element Clickable(Element element, std::function<void()> onClick) {
    element.onClick = std::move(onClick);
    return element;
}

void Component::invalidate() {
    if (invalidateCallback_) {
        invalidateCallback_();
    }
}

ComponentHost::ComponentHost() : buildDirty_(std::make_shared<bool>(false)) {}
ComponentHost::~ComponentHost() = default;

void ComponentHost::rebuild(Component& component) {
    component_ = &component;
    const std::weak_ptr<bool> weakDirty = buildDirty_;
    component.invalidateCallback_ = [weakDirty] {
        if (const std::shared_ptr<bool> dirty = weakDirty.lock()) {
            *dirty = true;
        }
    };
    reconcile();
}

void ComponentHost::reconcile() {
    if (component_ == nullptr) {
        return;
    }
    Element element = component_->build();
    if (root_ && root_->matches(element)) {
        root_->update(element);
    } else {
        root_ = std::make_unique<LayoutNode>(element);
    }
    *buildDirty_ = false;
}

void ComponentHost::layout(Size viewport) {
    if (*buildDirty_) {
        reconcile();
    }
    if (!root_) {
        return;
    }
    const Constraints tight{viewport.width, viewport.width, viewport.height, viewport.height};
    root_->measure(tight);
    root_->layout({{}, viewport});
}

void ComponentHost::paint(gfx::CommandEncoder& encoder, Size viewport) const {
    if (!root_) {
        return;
    }
    PaintContext context(encoder, viewport);
    root_->paint(context);
}

bool ComponentHost::pointerDown(Point point) {
    return root_ && root_->pointerDown(point);
}

Rect ComponentHost::rootBounds() const {
    return root_ ? root_->bounds() : Rect{};
}

} // namespace ui
