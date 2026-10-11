package com.example.folio.service;

import com.example.folio.dto.GoalRequest;
import com.example.folio.dto.GoalResponse;
import com.example.folio.entity.Goal;
import com.example.folio.entity.GoalProgressTable;
import com.example.folio.repository.GoalRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class GoalService {

    private static final int TITLE_MAX_LENGTH = 100;
    private static final int PROGRESS_MAX = 100;
    private static final int PROGRESS_NAME_MAX_LENGTH = 60;
    private static final int TEXT_ITEM_MAX = 100;
    private static final int TEXT_ITEM_MAX_LENGTH = 100;
    private static final String KIND_NUMBER = "NUMBER";
    private static final String KIND_TEXT = "TEXT";
    private static final String FORM_STUDY = "STUDY";
    private static final String FORM_AI = "AI";

    private final GoalRepository goalRepository;

    public GoalService(GoalRepository goalRepository) {
        this.goalRepository = goalRepository;
    }

    public List<GoalResponse> findAll() {
        return goalRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(GoalResponse::from)
            .toList();
    }

    @Transactional
    public GoalResponse create(GoalRequest request) {
        validate(request);

        Goal goal = new Goal();
        apply(goal, request);
        return GoalResponse.from(goalRepository.save(goal));
    }

    @Transactional
    public GoalResponse update(Long id, GoalRequest request) {
        validate(request);

        Goal goal = goalRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("목표를 찾을 수 없어요."));
        apply(goal, request);
        return GoalResponse.from(goal);
    }

    @Transactional
    public void deleteAll(List<Long> ids) {
        goalRepository.deleteAllById(ids);
        goalRepository.flush(); // 연결된 데이터 때문에 지울 수 없으면 여기서 바로 오류가 난다
    }

    /* ---------- 내부 처리 ---------- */

    /** 인라인 편집(자동 저장)이라 제목이 비어 있어도 저장한다. 목록에는 "제목 없는 목표"로 보인다. */
    private void validate(GoalRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("저장할 내용이 없어요.");
        }
        if (request.title() != null && request.title().trim().length() > TITLE_MAX_LENGTH) {
            throw new IllegalArgumentException("목표명은 " + TITLE_MAX_LENGTH + "자까지 쓸 수 있어요.");
        }
        if (request.formType() != null && !FORM_STUDY.equals(request.formType()) && !FORM_AI.equals(request.formType())) {
            throw new IllegalArgumentException("지원하지 않는 작성 양식이에요.");
        }
        if (request.startDate() != null && request.endDate() != null
            && request.startDate().isAfter(request.endDate())) {
            throw new IllegalArgumentException("종료일이 시작일보다 빠를 수 없어요.");
        }
        if (request.progressTables() != null) {
            request.progressTables().forEach(this::validateProgressTable);
        }
    }

    private void validateProgressTable(GoalRequest.ProgressTable table) {
        if (table == null) {
            return;
        }
        if (!KIND_NUMBER.equals(table.kind()) && !KIND_TEXT.equals(table.kind())) {
            throw new IllegalArgumentException("지원하지 않는 진도표 종류예요.");
        }
        if (table.name() != null && table.name().trim().length() > PROGRESS_NAME_MAX_LENGTH) {
            throw new IllegalArgumentException("표 이름은 " + PROGRESS_NAME_MAX_LENGTH + "자까지 쓸 수 있어요.");
        }
        if (KIND_TEXT.equals(table.kind())) {
            validateTextItems(table.items());
            return;
        }
        if (table.total() < 1 || table.total() > PROGRESS_MAX) {
            throw new IllegalArgumentException("진도표의 수는 1~" + PROGRESS_MAX + " 사이여야 해요.");
        }
        if (table.rows() < 1 || table.cols() < 1
            || table.rows() > PROGRESS_MAX || table.cols() > PROGRESS_MAX
            || (long) table.rows() * table.cols() < table.total()) {
            throw new IllegalArgumentException("행 × 열이 수의 개수보다 작아요.");
        }
    }

    private void validateTextItems(List<GoalRequest.Item> items) {
        if (items == null) {
            return;
        }
        if (items.size() > TEXT_ITEM_MAX) {
            throw new IllegalArgumentException("글자형 진도표는 줄을 " + TEXT_ITEM_MAX + "개까지 만들 수 있어요.");
        }
        for (GoalRequest.Item item : items) {
            if (item != null && item.text() != null && item.text().trim().length() > TEXT_ITEM_MAX_LENGTH) {
                throw new IllegalArgumentException("한 줄은 " + TEXT_ITEM_MAX_LENGTH + "자까지 쓸 수 있어요.");
            }
        }
    }

    /** 요청 내용을 엔티티에 반영한다. 진도표와 한 줄 리뷰는 화면에 보이는 순서대로 통째로 교체한다. */
    private void apply(Goal goal, GoalRequest request) {
        goal.change(
            request.title() == null ? "" : request.title().trim(),
            FORM_AI.equals(request.formType()) ? FORM_AI : FORM_STUDY,
            request.startDate(),
            request.endDate(),
            trim(request.goalUnit()),
            trim(request.goalFrequency()),
            trim(request.specialNotes()),
            trim(request.goalPromise()),
            request.freeMemo()
        );

        goal.clearProgressTables();
        if (request.progressTables() != null) {
            request.progressTables().stream()
                .filter(table -> table != null)
                .forEach(table -> addProgressTable(goal, table));
        }

        goal.clearNotes();
        if (request.notes() != null) {
            request.notes().stream()
                .filter(note -> note != null && StringUtils.hasText(note.text()))
                .forEach(note -> goal.addNote(note.date(), note.text().trim()));
        }
    }

    /** 숫자형은 수/행/열을, 글자형은 줄(글 + 완료 체크)을 저장한다. 글자형의 수/행/열은 0. */
    private void addProgressTable(Goal goal, GoalRequest.ProgressTable table) {
        if (KIND_TEXT.equals(table.kind())) {
            GoalProgressTable saved = goal.addProgressTable(KIND_TEXT, trim(table.name()), 0, 0, 0);
            if (table.items() != null) {
                table.items().stream()
                    .filter(item -> item != null)
                    .forEach(item -> saved.addItem(item.text() == null ? "" : item.text().trim(), item.done()));
            }
            return;
        }
        goal.addProgressTable(KIND_NUMBER, trim(table.name()), table.total(), table.rows(), table.cols());
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }
}
