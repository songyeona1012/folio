// 회원 탈퇴 시 해당 계정의 기록과 계정을 하나의 작업으로 삭제합니다.
package com.example.folio.service;

import com.example.folio.repository.*;
import com.example.folio.security.OwnerContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountClosureService {

    private final ScheduleRepository schedules;
    private final RecurringRuleRepository rules;
    private final DairyRepository diaries;
    private final GoalRepository goals;
    private final ManagementReportRepository reports;
    private final AuthorAccountRepository accounts;

    public AccountClosureService(
        ScheduleRepository schedules,
        RecurringRuleRepository rules,
        DairyRepository diaries,
        GoalRepository goals,
        ManagementReportRepository reports,
        AuthorAccountRepository accounts
    ) {
        this.schedules = schedules;
        this.rules = rules;
        this.diaries = diaries;
        this.goals = goals;
        this.reports = reports;
        this.accounts = accounts;
    }

    @Transactional
    public void closeCurrentAccount() {
        Long id = OwnerContext.id();
        // Explicit scoped lists: never call unscoped bulk-delete methods.
        schedules.deleteAll(schedules.findAll());
        schedules.flush();
        rules.deleteAll(rules.findAll());
        rules.flush();
        diaries.deleteAll(diaries.findAll());
        diaries.flush();
        goals.deleteAll(goals.findAll());
        goals.flush();
        reports.deleteAll(reports.findAll());
        reports.flush();
        accounts.deleteById(id);
        accounts.flush();
    }
}
