#include "GraphicsProtocol.hpp"
#include "LocalIPC.hpp"
#include "UI.hpp"

#include <chrono>
#include <cstdint>
#include <exception>
#include <iostream>
#include <memory>
#include <string>
#include <thread>

namespace {

class DemoComponent final : public ui::Component {
public:
    ui::Element build() override {
        ui::Style header{{360.0F, 68.0F}, {20.0F, 20.0F, 20.0F, 20.0F}, 0.0F,
                         {0.18F, 0.42F, 0.95F, 1.0F}};
        ui::Style redCard{{128.0F, 128.0F}, {18.0F, 18.0F, 18.0F, 18.0F}, 0.0F,
                          {0.95F, 0.24F, 0.20F, 1.0F}};
        ui::Style greenCard{{128.0F, 128.0F}, redCard.padding, 0.0F,
                            {0.16F, 0.78F, 0.42F, 1.0F}};
        ui::Style blueCard{{128.0F, 128.0F}, redCard.padding, 0.0F,
                           {0.24F, 0.48F, 1.0F, 1.0F}};
        ui::Style cards{{}, {}, 16.0F, {}};
        ui::Style footer{{416.0F, 42.0F}, {12.0F, 12.0F, 12.0F, 12.0F}, 0.0F,
                         {0.42F, 0.45F, 0.52F, 1.0F}};
        ui::Style page{{}, {48.0F, 48.0F, 48.0F, 48.0F}, 22.0F, {}};
        const ui::TextStyle titleText{24.0F, {1.0F, 1.0F, 1.0F, 1.0F}};
        const ui::TextStyle cardText{18.0F, {0.04F, 0.05F, 0.08F, 1.0F}};
        const ui::TextStyle footerText{14.0F, {1.0F, 1.0F, 1.0F, 1.0F}};

        if (selectedCard_ == 0) redCard.background = {1.0F, 0.52F, 0.20F, 1.0F};
        if (selectedCard_ == 1) greenCard.background = {0.45F, 1.0F, 0.58F, 1.0F};
        if (selectedCard_ == 2) blueCard.background = {0.48F, 0.72F, 1.0F, 1.0F};
        redCard.flexGrow = greenCard.flexGrow = blueCard.flexGrow = 1.0F;
        cards.crossAxisAlignment = ui::CrossAxisAlignment::stretch;
        page.crossAxisAlignment = ui::CrossAxisAlignment::stretch;

        return ui::Column({
            ui::Stack({ui::Text("MGFX UI", titleText)}, header, "header"),
            ui::Row({
                card("ONE", redCard, cardText, 0, "red-card"),
                card("TWO", greenCard, cardText, 1, "green-card"),
                card("THREE", blueCard, cardText, 2, "blue-card"),
            }, cards, "cards"),
            ui::Stack({ui::Text("CLICK A CARD", footerText)}, footer, "footer"),
        }, page, "page");
    }

private:
    ui::Element card(const char* label,
                     ui::Style style,
                     ui::TextStyle textStyle,
                     int index,
                     const char* key) {
        return ui::Clickable(ui::Stack({ui::Text(label, textStyle)}, style, key),
                             [this, index] { selectCard(index); });
    }

    void selectCard(int index) {
        if (selectedCard_ != index) {
            selectedCard_ = index;
            invalidate();
        }
    }

    int selectedCard_ = -1;
};

std::shared_ptr<mgfx::ipc::Connection> connectWithRetry(const std::string& path) {
    for (unsigned attempt = 0; attempt < 100; ++attempt) {
        try {
            return mgfx::ipc::connect(path);
        } catch (const std::exception&) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
    }
    throw std::runtime_error("Could not connect to MGFX server at " + path);
}

void sendFrame(const std::shared_ptr<mgfx::ipc::Connection>& connection,
               ui::ComponentHost& host,
               ui::Size viewport) {
    if (viewport.width <= 0.0F || viewport.height <= 0.0F) {
        return;
    }
    host.layout(viewport);
    gfx::CommandEncoder encoder;
    encoder.clear({0.025F, 0.035F, 0.055F, 1.0F});
    host.paint(encoder, viewport);
    encoder.endFrame();
    connection->send(mgfx::ipc::MessageType::frame, encoder.finish());
}

} // namespace

int main(int argc, char** argv) {
    try {
        const std::string socketPath = argc > 1 ? argv[1] : mgfx::ipc::defaultSocketPath();
        const auto connection = connectWithRetry(socketPath);
        connection->send(mgfx::ipc::MessageType::windowTitle,
                         mgfx::ipc::encodeText("MGFX C++ Client"));
        connection->send(mgfx::ipc::MessageType::windowConfig,
                         mgfx::ipc::encodeWindowConfig({960, 640, 640, 480}));
        connection->send(mgfx::ipc::MessageType::windowState,
                         mgfx::ipc::encodeWindowState({mgfx::ipc::WindowMode::normal, true}));
        DemoComponent component;
        ui::ComponentHost host;
        host.rebuild(component);
        ui::Size viewport{};

        mgfx::ipc::Message message{};
        while (connection->receive(message)) {
            if (message.type == mgfx::ipc::MessageType::serverHello) {
                mgfx::ipc::ServerHello hello{};
                if (!mgfx::ipc::decodeServerHello(message.payload, hello) ||
                    hello.version != mgfx::ipc::protocolVersion) {
                    throw std::runtime_error("Incompatible MGFX server handshake");
                }
            } else if (message.type == mgfx::ipc::MessageType::resize) {
                std::uint32_t width = 0;
                std::uint32_t height = 0;
                if (mgfx::ipc::decodeSize(message.payload, width, height)) {
                    viewport = {static_cast<float>(width), static_cast<float>(height)};
                    sendFrame(connection, host, viewport);
                }
            } else if (message.type == mgfx::ipc::MessageType::pointerDown) {
                float x = 0.0F;
                float y = 0.0F;
                if (mgfx::ipc::decodePoint(message.payload, x, y)) {
                    host.pointerDown({x, y});
                    sendFrame(connection, host, viewport);
                }
            } else if (message.type == mgfx::ipc::MessageType::close) {
                break;
            }
        }
        connection->send(mgfx::ipc::MessageType::close);
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "MGFXDemo: " << error.what() << '\n';
        return 1;
    }
}
