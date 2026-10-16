// 목표와 목표별 진행·메모·금전 기록을 저장하고 조회합니다.
package com.example.folio.service;

import com.example.folio.dto.GoalRequest;
import com.example.folio.dto.GoalResponse;
import com.example.folio.entity.Goal;
import com.example.folio.entity.GoalProgressTable;
import com.example.folio.repository.GoalRepository;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

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
    private static final String FORM_MONEY = "MONEY";
    private static final String FORM_AI = "AI";

    /** 금전: 목표 금액은 1만원 이상 100억원 미만. 시작/입금 금액은 0원부터 같은 상한 */
    private static final long MONEY_TARGET_MIN = 10_000L;
    private static final long MONEY_LIMIT = 10_000_000_000L;
    private static final int CYCLE_MAX_LENGTH = 100;
    private static final int PHOTO_MAX_LENGTH = 1_400_000;
    private static final int PHOTO_URL_MAX_LENGTH = 1_500;
    private static final int TX_MAX = 500;
    private static final String TX_IN = "IN";
    private static final String TX_OUT = "OUT";
    private static final Pattern TIME_PATTERN = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");
    private static final int AI_FORM_MAX_LENGTH = 200_000;

    private final GoalRepository goalRepository;

    public GoalService(GoalRepository goalRepository) {
        this.goalRepository = goalRepository;
    }

    public List<GoalResponse> findAll() {
        return goalRepository.findAllByOrderByCreatedAtDesc().stream().map(GoalResponse::from).toList();
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

        Goal goal = goalRepository
            .findById(id)
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
        if (
            request.formType() != null &&
            !FORM_STUDY.equals(request.formType()) &&
            !FORM_MONEY.equals(request.formType()) &&
            !FORM_AI.equals(request.formType())
        ) {
            throw new IllegalArgumentException("지원하지 않는 작성 양식이에요.");
        }
        if (
            request.startDate() != null &&
            request.endDate() != null &&
            request.startDate().isAfter(request.endDate())
        ) {
            throw new IllegalArgumentException("종료일이 시작일보다 빠를 수 없어요.");
        }
        if (request.progressTables() != null) {
            request.progressTables().forEach(this::validateProgressTable);
        }
        validateMoney(request);
        validateAiForm(request.aiForm());
    }

    private void validateMoney(GoalRequest request) {
        if (
            request.targetAmount() != null &&
            (request.targetAmount() < MONEY_TARGET_MIN || request.targetAmount() >= MONEY_LIMIT)
        ) {
            throw new IllegalArgumentException("목표 금액은 1만원 이상 100억원 미만으로 적어 주세요.");
        }
        checkAmount(request.startAmount(), "시작 금액");
        checkAmount(request.depositAmount(), "입금 금액");
        if (request.depositCycle() != null && request.depositCycle().trim().length() > CYCLE_MAX_LENGTH) {
            throw new IllegalArgumentException("입금 주기는 " + CYCLE_MAX_LENGTH + "자까지 쓸 수 있어요.");
        }
        validatePhoto(request.photo());

        List<GoalRequest.Transaction> transactions = request.transactions();
        if (transactions == null) {
            return;
        }
        if (transactions.size() > TX_MAX) {
            throw new IllegalArgumentException("입출금 내역은 " + TX_MAX + "건까지 적을 수 있어요.");
        }
        for (GoalRequest.Transaction tx : transactions) {
            if (tx == null) {
                continue;
            }
            if (tx.amount() < 1 || tx.amount() >= MONEY_LIMIT) {
                throw new IllegalArgumentException("입출금 금액은 1원 이상 100억원 미만으로 적어 주세요.");
            }
            if (tx.type() != null && !TX_IN.equals(tx.type()) && !TX_OUT.equals(tx.type())) {
                throw new IllegalArgumentException("입금 또는 출금만 고를 수 있어요.");
            }
            if (StringUtils.hasText(tx.time()) && !TIME_PATTERN.matcher(tx.time().trim()).matches()) {
                throw new IllegalArgumentException("시간은 00:00 모양으로 적어 주세요.");
            }
        }
    }

    private void checkAmount(Long value, String name) {
        if (value != null && (value < 0 || value >= MONEY_LIMIT)) {
            throw new IllegalArgumentException(name + "은 0원 이상 100억원 미만으로 적어 주세요.");
        }
    }

    /** 사진은 화면에서 줄여 만든 data URL이거나, 붙여넣은 이미지 주소(http/https)만 받는다. */
    private void validatePhoto(String photo) {
        if (!StringUtils.hasText(photo)) {
            return;
        }
        boolean dataUrl = photo.startsWith("data:image/");
        boolean webUrl = photo.startsWith("https://") || photo.startsWith("http://");
        if (!dataUrl && !webUrl) {
            throw new IllegalArgumentException("사진 형식을 알 수 없어요.");
        }
        if (dataUrl && photo.length() > PHOTO_MAX_LENGTH) {
            throw new IllegalArgumentException("사진이 너무 커요. 더 작은 사진을 골라 주세요.");
        }
        if (webUrl && photo.length() > PHOTO_URL_MAX_LENGTH) {
            throw new IllegalArgumentException("사진 주소가 너무 길어요.");
        }
    }

    private void validateAiForm(String aiForm) {
        if (aiForm != null && aiForm.length() > AI_FORM_MAX_LENGTH) {
            throw new IllegalArgumentException("대화와 양식이 너무 길어요. 일부를 지워 주세요.");
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
            throw new IllegalArgumentException(
                "표 이름은 " + PROGRESS_NAME_MAX_LENGTH + "자까지 쓸 수 있어요."
            );
        }
        if (KIND_TEXT.equals(table.kind())) {
            validateTextItems(table.items());
            return;
        }
        if (table.total() < 1 || table.total() > PROGRESS_MAX) {
            throw new IllegalArgumentException("진도표의 수는 1~" + PROGRESS_MAX + " 사이여야 해요.");
        }
        if (
            table.rows() < 1 ||
            table.cols() < 1 ||
            table.rows() > PROGRESS_MAX ||
            table.cols() > PROGRESS_MAX ||
            (long) table.rows() * table.cols() < table.total()
        ) {
            throw new IllegalArgumentException("행 × 열이 수의 개수보다 작아요.");
        }
    }

    private void validateTextItems(List<GoalRequest.Item> items) {
        if (items == null) {
            return;
        }
        if (items.size() > TEXT_ITEM_MAX) {
            throw new IllegalArgumentException(
                "글자형 진도표는 줄을 " + TEXT_ITEM_MAX + "개까지 만들 수 있어요."
            );
        }
        for (GoalRequest.Item item : items) {
            if (item != null && item.text() != null && item.text().trim().length() > TEXT_ITEM_MAX_LENGTH) {
                throw new IllegalArgumentException(
                    "한 줄은 " + TEXT_ITEM_MAX_LENGTH + "자까지 쓸 수 있어요."
                );
            }
        }
    }

    /** 요청 내용을 엔티티에 반영한다. 진도표와 한 줄 리뷰는 화면에 보이는 순서대로 통째로 교체한다. */
    private void apply(Goal goal, GoalRequest request) {
        goal.change(
            request.title() == null ? "" : request.title().trim(),
            normalizeFormType(request.formType()),
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
            request
                .progressTables()
                .stream()
                .filter(table -> table != null)
                .forEach(table -> addProgressTable(goal, table));
        }

        goal.clearNotes();
        if (request.notes() != null) {
            request
                .notes()
                .stream()
                .filter(note -> note != null && StringUtils.hasText(note.text()))
                .forEach(note -> goal.addNote(note.date(), note.text().trim()));
        }

        applyMoney(goal, request);
        goal.changeAiForm(
            FORM_AI.equals(goal.getFormType()) && StringUtils.hasText(request.aiForm())
                ? request.aiForm()
                : null
        );
    }

    private static String normalizeFormType(String formType) {
        if (FORM_AI.equals(formType) || FORM_MONEY.equals(formType)) {
            return formType;
        }
        return FORM_STUDY;
    }

    /** 금전 양식일 때만 금액/사진/입출금 내역을 저장하고, 다른 양식이면 비운다. */
    private void applyMoney(Goal goal, GoalRequest request) {
        goal.clearTransactions();
        if (!FORM_MONEY.equals(goal.getFormType())) {
            goal.changeMoney(null, null, null, null, null);
            return;
        }
        goal.changeMoney(
            request.targetAmount(),
            request.startAmount(),
            request.depositAmount(),
            trim(request.depositCycle()),
            StringUtils.hasText(request.photo()) ? request.photo().trim() : null
        );
        if (request.transactions() != null) {
            request
                .transactions()
                .stream()
                .filter(tx -> tx != null)
                .forEach(tx ->
                    goal.addTransaction(
                        tx.date(),
                        StringUtils.hasText(tx.time()) ? tx.time().trim() : null,
                        TX_OUT.equals(tx.type()) ? TX_OUT : TX_IN,
                        tx.amount()
                    )
                );
        }
    }

    /** 숫자형은 수/행/열을, 글자형은 줄(글 + 완료 체크)을 저장한다. 글자형의 수/행/열은 0. */
    private void addProgressTable(Goal goal, GoalRequest.ProgressTable table) {
        if (KIND_TEXT.equals(table.kind())) {
            GoalProgressTable saved = goal.addProgressTable(KIND_TEXT, trim(table.name()), 0, 0, 0);
            if (table.items() != null) {
                table
                    .items()
                    .stream()
                    .filter(item -> item != null)
                    .forEach(item ->
                        saved.addItem(item.text() == null ? "" : item.text().trim(), item.done())
                    );
            }
            return;
        }
        goal.addProgressTable(KIND_NUMBER, trim(table.name()), table.total(), table.rows(), table.cols());
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }
}
