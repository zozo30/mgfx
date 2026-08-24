#pragma once

#include "SystemText.hpp"

#include <cstddef>
#include <cstdint>
#include <limits>
#include <string>
#include <unordered_map>
#include <utility>

namespace gfx {

class TextGeometryCache final {
public:
    struct Stats {
        std::size_t entries = 0;
        std::size_t points = 0;
        std::uint64_t hits = 0;
        std::uint64_t misses = 0;
        std::uint64_t evictions = 0;
    };

    explicit TextGeometryCache(std::size_t maximumEntries = 512,
                               std::size_t maximumPoints = 2'000'000)
        : maximumEntries_(maximumEntries), maximumPoints_(maximumPoints) {}

    template <typename Factory>
    ShapedText& getOrCreate(std::string key, Factory&& factory) {
        auto found = entries_.find(key);
        if (found != entries_.end()) {
            ++hits_;
            found->second.lastUsed = ++clock_;
            return found->second.shaped;
        }
        ++misses_;
        ShapedText shaped = std::forward<Factory>(factory)();
        const std::size_t points = shaped.triangles.size() + shaped.strokeTriangles.size();
        auto [inserted, created] = entries_.try_emplace(
            std::move(key), Entry{std::move(shaped), ++clock_, points});
        if (created) pointCount_ += points;
        return inserted->second.shaped;
    }

    void trim() {
        while (entries_.size() > maximumEntries_ ||
               (pointCount_ > maximumPoints_ && entries_.size() > 1)) {
            auto oldest = entries_.end();
            std::uint64_t oldestUse = std::numeric_limits<std::uint64_t>::max();
            for (auto entry = entries_.begin(); entry != entries_.end(); ++entry) {
                if (entry->second.lastUsed < oldestUse) {
                    oldest = entry;
                    oldestUse = entry->second.lastUsed;
                }
            }
            if (oldest == entries_.end()) break;
            pointCount_ -= oldest->second.points;
            entries_.erase(oldest);
            ++evictions_;
        }
    }

    Stats stats() const {
        return {entries_.size(), pointCount_, hits_, misses_, evictions_};
    }

private:
    struct Entry {
        ShapedText shaped;
        std::uint64_t lastUsed;
        std::size_t points;
    };
    std::size_t maximumEntries_;
    std::size_t maximumPoints_;
    std::size_t pointCount_ = 0;
    std::uint64_t clock_ = 0;
    std::uint64_t hits_ = 0;
    std::uint64_t misses_ = 0;
    std::uint64_t evictions_ = 0;
    std::unordered_map<std::string, Entry> entries_;
};

} // namespace gfx
