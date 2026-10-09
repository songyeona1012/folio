package com.example.folio.service;

import com.example.folio.dto.ScheduleDto;
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.responses.Response;
import com.openai.models.responses.ResponseCreateParams;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AiService {

    private static final String MODEL = "gpt-5-nano";

    private final OpenAIClient client;
    private final JsonMapper jsonMapper;

    public AiService(
        @Value("${openai.api.key:}") String apiKey,
        JsonMapper jsonMapper
    ) {
        // AI is optional; ordinary calendar and management features work without a key.
        this.client = apiKey == null || apiKey.isBlank()
            ? null
            : OpenAIOkHttpClient.builder().apiKey(apiKey).build();

        this.jsonMapper = jsonMapper;
    }

    public String narrate(String evidence) {
        if (client == null) return null;
        try {
            ResponseCreateParams params = ResponseCreateParams.builder()
                .model(MODEL)
                .input(
                    "당신은 한국어 관리 일정 도우미입니다. " +
                        "아래의 실제 관리 일정 완료 횟수와 완료율만 근거로 600자 이내 브리핑을 작성하세요. " +
                        "첫 문장은 도래한 관리 일정 수, 완료 횟수, 완료율을 포함해 관리되고 있는 정도를 요약하세요. " +
                        "이어서 기록에 맞는 따뜻한 응원이나 실천 가능한 짧은 조언을 제공하세요. " +
                        "건강·구독·교체·일상별 기록이 있으면 구체적인 완료 횟수에 근거해 설명하세요. " +
                        "일정 혼잡도, 바쁨, 압박감, 감정·별점 평가는 하지 마세요. " +
                        "완료율로 성격이나 건강 상태를 단정하거나 사용자에게 죄책감을 주지 마세요. " +
                        "완료율을 평가할 기록이 없는 카테고리는 미흡하다고 평가하지 마세요. " +
                        "수치와 인용문을 만들어내지 말고 미래 일정은 성과에 포함하지 마세요.\n\n" +
                        evidence
                )
                .build();

            Response response = client.responses().create(params);

            String text = response.output().stream()
                .flatMap(item -> item.message().stream())
                .flatMap(message -> message.content().stream())
                .flatMap(content -> content.outputText().stream())
                .map(outputText -> outputText.text())
                .findFirst()
                .orElse(null);

            return text == null || text.isBlank()
                ? null
                : text.substring(0, Math.min(text.length(), 6000));

        } catch (Exception e) {
            System.out.println("🚨 OpenAI 보고서 생성 실패!");
            e.printStackTrace();
            return null;
        }
    }

    public ScheduleDto parseSchedule(String text) {
        if (client == null) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "AI 일정 분석을 사용하려면 OPENAI_API_KEY 환경변수를 설정해주세요."
            );
        }


        String today = LocalDate.now().toString();

        String prompt = """
                당신은 일정 관리 앱의 일정 분석 AI입니다.

                사용자가 입력한 자연어에서 일정 정보를 추출합니다.

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

        try {
            ResponseCreateParams params = ResponseCreateParams.builder()
                .model(MODEL)
                .input(prompt)
                .build();

            Response response = client.responses().create(params);

            String json = response.output().stream()
                .flatMap(item -> item.message().stream())
                .flatMap(message -> message.content().stream())
                .flatMap(content -> content.outputText().stream())
                .map(outputText -> outputText.text())
                .findFirst()
                .orElse(null);

            System.out.println("🤖 OpenAI가 뱉어낸 JSON 데이터: " + json);

            if (json == null || json.isBlank()) {
                throw new RuntimeException("OpenAI 응답이 비어 있습니다.");
            }

            json = json
                .replaceAll("(?s)^```(?:json)?\\s*|\\s*```$", "")
                .trim();

            return jsonMapper.readValue(json, ScheduleDto.class);

        } catch (Exception e) {

            System.out.println("🚨 OpenAI 일정 분석 실패!");
            e.printStackTrace();

            throw new RuntimeException(
                "AI 일정 분석에 실패했습니다.",
                e
            );
        }
    }
}
