// 목표의 기본 정보와 하위 진행 기록을 연결합니다.
package com.example.folio.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.hibernate.annotations.BatchSize;

/**
 * 목표 한 건. 표(기간/진행 단위/학습 빈도/특이 사항/다짐), 진도표, 오늘의 공부 한 줄 리뷰를 함께 가진다.
 * 금전 양식이면 목표 금액/시작 금액/입금 금액·주기/사진/입출금 내역을, AI 자율 작성이면 대화와 만들어진 양식(JSON)을 함께 가진다.
 */
@Entity
@Table(name = "goals")
public class Goal extends OwnedRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String title;

    private LocalDate startDate;

    private LocalDate endDate;

    /** 진행 단위 */
    @Column(length = 50)
    private String goalUnit;

    /** 학습 빈도 */
    @Column(length = 255)
    private String goalFrequency;

    /** 특이 사항 */
    @Column(length = 255)
    private String specialNotes;

    /** 다짐 */
    @Column(length = 255)
    private String goalPromise;

    /** AI 자율 작성 화면의 자유 메모 */
    @Lob
    private String freeMemo;

    /**
     * 목록 카드 색: YELLOW 또는 PINK. 만들 때 완전 무작위로 정해져서(번갈아 나오지 않는다)
     * 같은 색이 연달아 나올 수도 있다. 이 기능 이전에 만든 목표는 null.
     */
    @Column(length = 10)
    private String cardColor;

    /**
     * 작성 양식: STUDY(공부), MONEY(금전) 또는 AI(AI 자율 작성). 왼쪽 양식 바에서 고른 양식으로 만들어지고,
     * 목록에서 다시 열 때 같은 양식으로 보여 주는 데 쓴다. 이 기능 이전에 만든 목표는 null → STUDY로 본다.
     */
    @Column(length = 10)
    private String formType;

    /** 금전: 목표 금액(원). 1만원 이상 100억원 미만. */
    private Long targetAmount;

    /** 금전: 시작 금액(원). 이미 모아 둔 돈. */
    private Long startAmount;

    /** 금전: 한 번에 입금할 금액(원) */
    private Long depositAmount;

    /** 금전: 입금 주기를 사용자가 적은 그대로 ("매 달 4일", "주 2회" 등) */
    @Column(length = 100)
    private String depositCycle;

    /** 금전: 사진 (화면에서 줄여 만든 data URL, 비어 있으면 사진 없음) */
    @Lob
    private String photo;

    /** AI 자율 작성: 대화와 만들어진 양식을 화면이 JSON 문자열로 만들어 보낸 것 */
    @Lob
    private String aiForm;

    @OneToMany(mappedBy = "goal", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<GoalProgressTable> progressTables = new ArrayList<>();

    @OneToMany(mappedBy = "goal", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<GoalNote> notes = new ArrayList<>();

    @OneToMany(mappedBy = "goal", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<GoalTransaction> transactions = new ArrayList<>();

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public Goal() {}

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.cardColor == null) {
            this.cardColor = ThreadLocalRandom.current().nextBoolean() ? "YELLOW" : "PINK";
        }
    }

    /** 표에 적는 기본 정보를 한 번에 바꾼다. 수정 시각도 함께 갱신한다. */
    public void change(
        String title,
        String formType,
        LocalDate startDate,
        LocalDate endDate,
        String goalUnit,
        String goalFrequency,
        String specialNotes,
        String goalPromise,
        String freeMemo
    ) {
        this.title = title;
        this.formType = formType;
        this.startDate = startDate;
        this.endDate = endDate;
        this.goalUnit = goalUnit;
        this.goalFrequency = goalFrequency;
        this.specialNotes = specialNotes;
        this.goalPromise = goalPromise;
        this.freeMemo = freeMemo;
        this.updatedAt = LocalDateTime.now();
    }

    /** 금전 양식의 값을 한 번에 바꾼다. 다른 양식에서는 모두 null/빈 문자열로 비운다. */
    public void changeMoney(
        Long targetAmount,
        Long startAmount,
        Long depositAmount,
        String depositCycle,
        String photo
    ) {
        this.targetAmount = targetAmount;
        this.startAmount = startAmount;
        this.depositAmount = depositAmount;
        this.depositCycle = depositCycle;
        this.photo = photo;
    }

    public void changeAiForm(String aiForm) {
        this.aiForm = aiForm;
    }

    public void clearTransactions() {
        transactions.clear();
    }

    public void addTransaction(LocalDate txDate, String txTime, String txType, long amount) {
        transactions.add(new GoalTransaction(this, txDate, txTime, txType, amount, transactions.size()));
    }

    public void clearProgressTables() {
        progressTables.clear();
    }

    /** 진도표를 맨 뒤에 붙이고 돌려준다. 글자형이면 돌려받은 표에 addItem()으로 줄을 채운다. */
    public GoalProgressTable addProgressTable(String kind, String name, int total, int rows, int cols) {
        GoalProgressTable table = new GoalProgressTable(
            this,
            kind,
            name,
            total,
            rows,
            cols,
            progressTables.size()
        );
        progressTables.add(table);
        return table;
    }

    public void clearNotes() {
        notes.clear();
    }

    public void addNote(LocalDate noteDate, String content) {
        notes.add(new GoalNote(this, noteDate, content, notes.size()));
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public String getGoalUnit() {
        return goalUnit;
    }

    public String getGoalFrequency() {
        return goalFrequency;
    }

    public String getSpecialNotes() {
        return specialNotes;
    }

    public String getGoalPromise() {
        return goalPromise;
    }

    public String getFreeMemo() {
        return freeMemo;
    }

    public String getCardColor() {
        return cardColor;
    }

    public String getFormType() {
        return formType == null ? "STUDY" : formType;
    }

    public Long getTargetAmount() {
        return targetAmount;
    }

    public Long getStartAmount() {
        return startAmount;
    }

    public Long getDepositAmount() {
        return depositAmount;
    }

    public String getDepositCycle() {
        return depositCycle;
    }

    public String getPhoto() {
        return photo;
    }

    public String getAiForm() {
        return aiForm;
    }

    public List<GoalTransaction> getTransactions() {
        return transactions;
    }

    public List<GoalProgressTable> getProgressTables() {
        return progressTables;
    }

    public List<GoalNote> getNotes() {
        return notes;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
