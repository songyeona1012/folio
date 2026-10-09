package com.example.folio.controller;

import com.example.folio.dto.GoalRequest;
import com.example.folio.dto.GoalResponse;
import com.example.folio.service.GoalService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * goal.js가 호출하는 API.
 *   GET    /api/goals              목록
 *   POST   /api/goals              새 목표 저장
 *   PUT    /api/goals/{id}         목표 수정
 *   DELETE /api/goals?ids=1,2,3    선택한 목표 삭제
 */
@RestController
@RequestMapping("/api/goals")
public class GoalApiController {

    private static final Logger log = LoggerFactory.getLogger(GoalApiController.class);

    private final GoalService goalService;

    public GoalApiController(GoalService goalService) {
        this.goalService = goalService;
    }

    @GetMapping
    public List<GoalResponse> list() {
        return goalService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GoalResponse create(@RequestBody GoalRequest request) {
        return goalService.create(request);
    }

    @PutMapping("/{id}")
    public GoalResponse update(@PathVariable("id") Long id, @RequestBody GoalRequest request) {
        return goalService.update(id, request);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAll(@RequestParam("ids") List<Long> ids) {
        goalService.deleteAll(ids);
    }

    /* 화면이 {"message": "..."}를 읽어 알림으로 보여 준다 */

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> notFound(NoSuchElementException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
    }

    /** 다른 테이블이 이 목표를 가리키고 있어 지울 수 없을 때 (예: 예전 goal_checklist_items 테이블에 남은 행) */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> conflict(DataIntegrityViolationException e) {
        log.warn("목표를 저장/삭제하지 못했습니다. 연결된 데이터나 제약 조건을 확인하세요.", e);
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("message", "연결된 데이터가 남아 있어 처리하지 못했어요. 서버 로그를 확인해 주세요."));
    }
}
