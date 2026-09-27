package com.example.folio.service;

import com.example.folio.dto.ScheduleDto;
import com.google.genai.Client;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDate;

@Service
public class AiService {

    private final Client client;
    private final JsonMapper jsonMapper;

    public AiService(
            @Value("${gemini.api.key}") String apiKey,
            JsonMapper jsonMapper
    ) {
        this.client = Client.builder()
                .apiKey(apiKey)
                .build();

        this.jsonMapper = jsonMapper;
    }

    public ScheduleDto parseSchedule(String text) {

        String today = LocalDate.now().toString();

        String prompt = """
                당신은 일정 관리 앱의 일정 분석 AI입니다.

                사용자가 입력한 자연어 문장에서 일정 정보를 추출해주세요.

                오늘 날짜는 %s 입니다.

                반드시 아래 JSON 형식으로만 응답하세요.

                {
                  "title": "일정 제목",
                  "date": "yyyy-MM-dd",
                  "time": "HH:mm",
                  "category": "todo",
                  "private": false
                }

                규칙:
                1. title에는 실제 일정 내용만 넣습니다.
                2. date는 반드시 yyyy-MM-dd 형식으로 작성합니다.
                3. 사용자가 날짜를 말하지 않았다면 오늘 날짜를 사용합니다.
                4. "오늘", "내일", "모레"는 오늘 날짜를 기준으로 계산합니다.
                5. "오후 6시"는 "18:00"으로 변환합니다.
                6. "저녁 7시"는 "19:00"으로 변환합니다.
                7. 시간이 없으면 time은 null로 설정합니다.
                8. category는 todo, important, health 중 하나만 사용합니다.
                9. 일반적인 일정은 todo로 설정합니다.
                10. 시험, 발표, 중요한 약속 등은 important로 설정합니다.
                11. 운동, 병원, 건강검진 등은 health로 설정합니다.
                12. private는 사용자가 비공개라고 명시한 경우에만 true로 설정합니다.
                13. 반드시 JSON만 출력하고 설명은 출력하지 않습니다.

                사용자 입력:
                %s
                """.formatted(today, text);

        GenerateContentConfig config =
                GenerateContentConfig.builder()
                        .responseMimeType("application/json")
                        .build();

        GenerateContentResponse response =
                client.models.generateContent(
                        "gemini-flash-latest",
                        prompt,
                        config
                );

        try {
            String json = response.text();

            return jsonMapper.readValue(
                    json,
                    ScheduleDto.class
            );

        } catch (Exception e) {
            throw new RuntimeException(
                    "AI 일정 분석에 실패했습니다.",
                    e
            );
        }
    }
}