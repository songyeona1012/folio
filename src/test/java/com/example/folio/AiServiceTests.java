package com.example.folio;

import static org.junit.jupiter.api.Assertions.*;

import com.example.folio.service.AiService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class AiServiceTests {
    @Test
    void missingKeyAllowsStartupAndBasicReports() {
        for (String key : new String[] {null, "", "   "}) {
            var service = new AiService(key, JsonMapper.builder().build());
            assertNull(service.narrate("일정 0건"));
            var error = assertThrows(ResponseStatusException.class,
                () -> service.parseSchedule("내일 운동"));
            assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
            assertTrue(error.getReason().contains("OPENAI_API_KEY"));
        }
    }
}
