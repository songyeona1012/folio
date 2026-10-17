// 화면에서 보낸 AI 요청을 서비스에 전달합니다.
package com.example.folio.controller;

import com.example.folio.dto.ScheduleDto;
import com.example.folio.service.AiService;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiService aiService;

    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/parse-schedule")
    public ScheduleDto parseSchedule(@RequestBody AiRequest request) {
        return aiService.parseSchedule(request.getText());
    }

    /* 자연어 명령: "내일 6시 저녁 약속" → 추가, "금요일 운동 8시로 미뤄줘" → 수정 */
    @PostMapping("/command")
    public Map<String, Object> command(@RequestBody AiRequest request) {
        return aiService.command(request.getText());
    }

    /* 이번 주(일~토) 일정 분석. date가 없으면 오늘이 속한 주 */
    @GetMapping("/week-report")
    public Map<String, Object> weekReport(@RequestParam(required = false) String date) {
        return aiService.weekReport(date == null || date.isBlank() ? null : LocalDate.parse(date));
    }

    public static class AiRequest {

        private String text;

        public AiRequest() {}

        public String getText() {
            return text;
        }

        public void setText(String text) {
            this.text = text;
        }
    }
}
