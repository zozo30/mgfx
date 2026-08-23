#pragma once

#include "GraphicsProtocol.hpp"

#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace ui {

struct Size {
    float width = 0.0F;
    float height = 0.0F;
};

struct Point {
    float x = 0.0F;
    float y = 0.0F;
};

struct Rect {
    Point origin;
    Size size;
};

struct Constraints {
    float minWidth = 0.0F;
    float maxWidth = 0.0F;
    float minHeight = 0.0F;
    float maxHeight = 0.0F;

    Size constrain(Size desired) const;
};

struct Insets {
    float top = 0.0F;
    float right = 0.0F;
    float bottom = 0.0F;
    float left = 0.0F;
};

enum class MainAxisAlignment {
    start,
    center,
    end,
    spaceBetween,
};

enum class CrossAxisAlignment {
    start,
    center,
    end,
    stretch,
};

struct Style {
    Size preferredSize{};
    Insets padding{};
    float gap = 0.0F;
    gfx::Color background{0.0F, 0.0F, 0.0F, 0.0F};
    float flexGrow = 0.0F;
    MainAxisAlignment mainAxisAlignment = MainAxisAlignment::start;
    CrossAxisAlignment crossAxisAlignment = CrossAxisAlignment::start;
    bool clip = false;
    float borderWidth = 0.0F;
    gfx::Color borderColor{0.0F, 0.0F, 0.0F, 0.0F};
    float cornerRadius = 0.0F;
};

struct TextStyle {
    float fontSize = 16.0F;
    gfx::Color color{1.0F, 1.0F, 1.0F, 1.0F};
};

enum class ElementType {
    box,
    row,
    column,
    stack,
    text,
    circle,
};

struct Element {
    ElementType type = ElementType::box;
    std::string key;
    Style style;
    std::vector<Element> children;
    std::function<void()> onClick;
    std::string text;
    TextStyle textStyle;
};

Element Box(Style style, std::string key = {}, std::function<void()> onClick = {});
Element Row(std::vector<Element> children, Style style = {}, std::string key = {});
Element Column(std::vector<Element> children, Style style = {}, std::string key = {});
Element Stack(std::vector<Element> children, Style style = {}, std::string key = {});
Element Text(std::string text, TextStyle style = {}, std::string key = {});
Element Circle(Style style, std::string key = {});
Element Clickable(Element element, std::function<void()> onClick);

class Component {
public:
    virtual ~Component() = default;
    virtual Element build() = 0;

protected:
    void invalidate();

private:
    friend class ComponentHost;
    std::function<void()> invalidateCallback_;
};

class LayoutNode;

class ComponentHost final {
public:
    ComponentHost();
    ~ComponentHost();

    ComponentHost(const ComponentHost&) = delete;
    ComponentHost& operator=(const ComponentHost&) = delete;

    void rebuild(Component& component);
    void layout(Size viewport);
    void paint(gfx::CommandEncoder& encoder, Size viewport) const;
    bool pointerDown(Point point);

    Rect rootBounds() const;

private:
    void reconcile();

    std::unique_ptr<LayoutNode> root_;
    Component* component_ = nullptr;
    std::shared_ptr<bool> buildDirty_;
};

} // namespace ui
