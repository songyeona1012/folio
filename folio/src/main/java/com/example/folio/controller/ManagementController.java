package com.example.folio.controller;

import com.example.folio.entity.*;
import com.example.folio.repository.*;
import com.example.folio.service.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/management")
public class ManagementController {

    private final RecurringService recurring;
    private final ManagementAnalytics analytics;

    public ManagementController(RecurringService recurring, ManagementAnalytics analytics) {
        this.recurring = recurring;
        this.analytics = analytics;
    }

    @GetMapping("/rules")
    public List<RecurringService.RuleView> rules() {
        return recurring.list();
    }

    @PostMapping("/rules")
    public RecurringRule create(@RequestBody RecurringRule input) {
        return recurring.save(null, input);
    }

    @PutMapping("/rules/{id}")
    public RecurringRule update(@PathVariable Long id, @RequestBody RecurringRule input) {
        return recurring.save(id, input);
    }

    @DeleteMapping("/rules/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        recurring.delete(id);
    }

    @GetMapping("/analytics")
    public ManagementAnalytics.Summary analytics(
        @RequestParam(defaultValue = "week") String period,
        @RequestParam LocalDate date
    ) {
        return analytics.summary(period, date);
    }

    @GetMapping("/completion-chart")
    public ManagementAnalytics.CompletionChart completionChart(
        @RequestParam(defaultValue = "week") String period,
        @RequestParam LocalDate date
    ) {
        return analytics.completionChart(period, date);
    }

    @PostMapping("/reports")
    public ManagementReport report(
        @RequestParam String period,
        @RequestParam LocalDate date,
        @RequestParam(defaultValue = "false") boolean retry
    ) {
        return analytics.report(period, date, retry);
    }
}
