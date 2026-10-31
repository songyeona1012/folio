// 현재 탭에 맞춰 책갈피 위치와 선택 상태를 구성합니다.
package com.example.folio.support;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// bookLayout.mustache에 내려줄 책갈피 4개의 위치와 이미지를 계산합니다.
// 항상 4개(메인/일기/관리/목표)이고,
// leftCount에 따라 왼쪽/오른쪽에 몇 개씩 배치할지 결정합니다.
//
// 이미지:
// 메인  -> index1.png
// 일기  -> index2.png
// 관리  -> index3.png
// 목표  -> index4.png

public final class BookmarkLayout {

    private static final String[] HREFS = { "/main", "/dairy", "/index", "/goal" };

    private static final String[] IMAGES = { "index1.png", "index2.png", "index3.png", "index4.png" };

    private BookmarkLayout() {}

    public static List<Map<String, Object>> of(int leftCount) {
        if (leftCount < 0 || leftCount > 4) {
            throw new IllegalArgumentException("leftCount는 0~4 사이여야 합니다: " + leftCount);
        }

        List<Map<String, Object>> result = new ArrayList<>();

        for (int i = 0; i < HREFS.length; i++) {
            boolean isLeft = i < leftCount;

            String posClass;

            if (isLeft) {
                // 왼쪽에서는 책등 쪽부터 페이지 순서가 이어지게 배치합니다.
                // 메인(파랑)=l4, 일기(초록)=l3, 관리(주황)=l2, 목표(회색)=l1입니다.
                posClass = "pos-l" + (HREFS.length - i);
            } else {
                // 페이지가 바뀌어도 각 색 책갈피는 같은 오른쪽 슬롯을 유지합니다.
                // 예: 관리(세 번째)는 항상 pos-r3, 목표(네 번째)는 항상 pos-r4입니다.
                posClass = "pos-r" + (i + 1);
            }

            Map<String, Object> bookmark = new LinkedHashMap<>();

            bookmark.put("href", HREFS[i]);
            bookmark.put("posClass", posClass + (i == leftCount ? " is-current" : ""));
            bookmark.put("image", IMAGES[i]);

            result.add(bookmark);
        }

        return result;
    }
}
