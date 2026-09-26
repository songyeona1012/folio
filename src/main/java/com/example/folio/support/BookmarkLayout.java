
package com.example.folio.support;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// bookLayout.mustache에 내려줄 책갈피 4개의 위치와 이미지를 계산합니다.
// 항상 4개(메인/일기/관리/친구)이고,
// leftCount에 따라 왼쪽/오른쪽에 몇 개씩 배치할지 결정합니다.
//
// 이미지:
// 메인  -> index1.png
// 일기  -> index2.png
// 관리  -> index3.png
// 친구  -> index4.png

public final class BookmarkLayout {

    private static final String[] HREFS = {
            "/main",
            "/dairy",
            "/index",
            "/friend"
    };

    private static final String[] IMAGES = {
            "index1.png",
            "index2.png",
            "index3.png",
            "index4.png"
    };

    private BookmarkLayout() {}

    public static List<Map<String, Object>> of(int leftCount) {

        if (leftCount < 0 || leftCount > 4) {
            throw new IllegalArgumentException(
                    "leftCount는 0~4 사이여야 합니다: " + leftCount
            );
        }

        List<Map<String, Object>> result = new ArrayList<>();

        int leftIdx = 0;
        int rightIdx = 0;

        for (int i = 0; i < HREFS.length; i++) {

            boolean isLeft = i < leftCount;

            String posClass;

            if (isLeft) {
                posClass = "pos-l" + (++leftIdx);
            } else {
                posClass = "pos-r" + (++rightIdx);
            }

            Map<String, Object> bookmark = new LinkedHashMap<>();

            bookmark.put("href", HREFS[i]);
            bookmark.put("posClass", posClass);
            bookmark.put("image", IMAGES[i]);

            result.add(bookmark);
        }

        return result;
    }
}
