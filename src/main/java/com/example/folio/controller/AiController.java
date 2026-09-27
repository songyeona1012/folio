package com.example.folio.controller;

import com.example.folio.dto.ScheduleDto;
import com.example.folio.service.AiService;
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

    public static class AiRequest {

        private String text;

        public AiRequest() {
        }

        public String getText() {
            return text;
        }

        public void setText(String text) {
            this.text = text;
        }
    }
}