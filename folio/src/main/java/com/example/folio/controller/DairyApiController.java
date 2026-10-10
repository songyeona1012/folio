package com.example.folio.controller;

import com.example.folio.dto.DairyRequest;
import com.example.folio.dto.DairyResponse;
import com.example.folio.dto.DairyYearSummary;
import com.example.folio.service.DairyService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * 일기 API
 *   GET    /api/dairy?date=2026-10-10          특정 날짜 일기 (없으면 204)
 *   GET    /api/dairy/month?year=2026&month=8 한 달 치 목록
 *   GET    /api/dairy/summary?year=2026       연간 요약 (기분 그래프 + 폴더)
 *   POST   /api/dairy                          저장 (같은 날짜면 수정)
 *   DELETE /api/dairy?ids=1&ids=2              선택 삭제 (여러 편)
 *   DELETE /api/dairy/{id}                     삭제
 *
 * 화면(/dairy)을 띄우는 컨트롤러는 기존 HomeController 것을 그대로 씁니다.
 */
@RestController
@RequestMapping("/api/dairy")
public class DairyApiController {

    /** 서버가 다른 시간대에서 돌아가도 한국 날짜 기준으로 "오늘"을 계산 */
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private final DairyService dairyService;

    public DairyApiController(DairyService dairyService) {
        this.dairyService = dairyService;
    }

    @GetMapping
    public ResponseEntity<DairyResponse> byDate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return dairyService.findByDate(date)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/month")
    public List<DairyResponse> byMonth(@RequestParam int year, @RequestParam int month) {
        return dairyService.findByMonth(year, month);
    }

    @GetMapping("/summary")
    public DairyYearSummary summary(@RequestParam int year) {
        return dairyService.summarizeYear(year, LocalDate.now(ZONE));
    }

    @PostMapping
    public DairyResponse save(@RequestBody DairyRequest request) {
        return dairyService.save(request, LocalDate.now(ZONE));
    }

    /** 선택 삭제: DELETE /api/dairy?ids=1&ids=2 → 지운 개수 */
    @DeleteMapping
    public Map<String, Integer> deleteSelected(@RequestParam List<Long> ids) {
        return Map.of("deleted", dairyService.deleteAll(ids));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        dairyService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
