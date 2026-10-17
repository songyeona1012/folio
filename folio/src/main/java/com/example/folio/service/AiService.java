// AI 요청과 응답을 처리하며 사용할 수 없는 경우 대체 응답을 준비합니다.
package com.example.folio.service;

import com.example.folio.dto.ScheduleDto;
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.responses.Response;
import com.openai.models.responses.ResponseCreateParams;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AiService {

    private static final String MODEL = "gpt-5-nano";

    private final OpenAIClient client;
    private final JsonMapper jsonMapper;

    public AiService(@Value("${openai.api.key:}") String apiKey, JsonMapper jsonMapper) {
        // AI is optional; ordinary calendar and management features work without a key.
        this.client =
            apiKey == null || apiKey.isBlank() ? null : OpenAIOkHttpClient.builder().apiKey(apiKey).build();

        this.jsonMapper = jsonMapper;
    }

    public String narrate(String evidence) {
        if (client == null) return null;
        try {
            ResponseCreateParams params = ResponseCreateParams.builder()
                .model(MODEL)
                .input(
                    "당신은 사용자의 관리 기록을 함께 돌아보는 한국어 코치입니다. " +
                        "실제 기록을 바탕으로 700~1100자, 4~5문단의 자연스러운 분석 편지를 작성하세요. 각 문단을 앞 문단과 연결하고, 수치를 설명한 다음 그 의미와 다음 실천으로 이어가세요. " +
                        "완료 건수를 차례로 나열하는 보고서나 누구에게나 적용되는 안내문은 피하세요. " +
                        "첫 문단은 가장 의미 있는 변화부터 시작하세요. 예를 들어 실제 자료가 뒷받침할 때만 '연초에는 잘 이어갔지만 최근 교체와 일상 관리에서 완료율이 낮아졌어요'처럼 흐름을 설명하세요. " +
                        "두 번째 문단은 가장 크게 하락한 월과 카테고리를 구체적으로 짚고, 앞선 기록 월 대비 완료율 차이를 %포인트로 계산해 설명하세요. 월별 일정 수가 함께 늘었다면 바쁜 일정과 관련이 있을 가능성을 조심스럽게 언급하세요. 단순히 함께 변했다고 원인으로 단정하지 마세요. " +
                        "세 번째 문단은 그 카테고리에 맞는 실천 조언을 주세요. 반복 관리에는 꾸준히 챙길 장치가 필요하다는 점을 설명하고, 다음 주기에 한 번 더 실천하도록 부드럽게 격려하세요. 교체는 미리 준비할 물품이나 알림, 일상은 기존 습관과 연결하는 방법처럼 사용자가 바로 할 수 있는 행동을 제안하세요. 사용자의 끈기나 성격이 부족하다고 평가하지 마세요. " +
                        "네 번째 문단은 건강·구독 등 실제로 잘 챙긴 카테고리를 짚어 균형 있게 칭찬하고, 다음 기간에 시도할 작은 목표로 마무리하세요. " +
                        "비교할 기록이 한 달뿐이면 연초나 하락을 만들어내지 말고 현재 완료·미완료 항목과 카테고리 차이를 구체적으로 분석하세요. 기록 없는 카테고리는 부진하다고 평가하지 마세요. " +
                        "예시의 5월, 하락률, 카테고리를 그대로 사용하지 말고 실제 자료에 맞춰 선택하세요. 쉬운 말과 따뜻한 존댓말을 사용하고 'AI가 분석한 결과' 같은 상투적인 문장은 쓰지 마세요. 수치, 원인, 건강 상태, 감정을 지어내지 마세요.\n\n" +
                        evidence
                )
                .build();

            Response response = client.responses().create(params);

            String text = response
                .output()
                .stream()
                .flatMap(item -> item.message().stream())
                .flatMap(message -> message.content().stream())
                .flatMap(content -> content.outputText().stream())
                .map(outputText -> outputText.text())
                .findFirst()
                .orElse(null);

            return text == null || text.isBlank() ? null : text.substring(0, Math.min(text.length(), 6000));
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
            ResponseCreateParams params = ResponseCreateParams.builder().model(MODEL).input(prompt).build();

            Response response = client.responses().create(params);

            String json = response
                .output()
                .stream()
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

            json = json.replaceAll("(?s)^```(?:json)?\\s*|\\s*```$", "").trim();

            return jsonMapper.readValue(json, ScheduleDto.class);
        } catch (Exception e) {
            System.out.println("🚨 OpenAI 일정 분석 실패!");
            e.printStackTrace();

            throw new RuntimeException("AI 일정 분석에 실패했습니다.", e);
        }
    }
}
