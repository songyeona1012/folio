package com.example.folio.dto;

import com.example.folio.entity.Goal;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 화면에 내려 주는 목표 한 건. 목록과 상세에 같은 모양을 쓴다.
 */
public record GoalResponse(
    Long id,
    String title,
    String cardColor,
    LocalDate startDate,
    LocalDate endDate,
    String goalUnit,
    String goalFrequency,
    String specialNotes,
    String goalPromise,
    String freeMemo,
    List<GoalRequest.ProgressTable> progressTables,
    List<GoalRequest.Note> notes,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {

    public static GoalResponse from(Goal goal) {
        return new GoalResponse(
            goal.getId(),
            goal.getTitle(),
            goal.getCardColor(),
            goal.getStartDate(),
            goal.getEndDate(),
            goal.getGoalUnit(),
            goal.getGoalFrequency(),
            goal.getSpecialNotes(),
            goal.getGoalPromise(),
            goal.getFreeMemo(),
            goal.getProgressTables().stream()
                .map(table -> new GoalRequest.ProgressTable(
                    table.getKind(), table.getName(), table.getTotal(), table.getRowCount(), table.getColCount()))
                .toList(),
            goal.getNotes().stream()
                .map(note -> new GoalRequest.Note(note.getNoteDate(), note.getContent()))
                .toList(),
            goal.getCreatedAt(),
            goal.getUpdatedAt()
        );
    }
}
