// 저자명·이름·암호 해시·프로필 사진 등 계정 정보를 저장합니다.
package com.example.folio.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "author_account", uniqueConstraints = @UniqueConstraint(columnNames = "author_id"))
public class AuthorAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "author_id", nullable = false, length = 30)
    public String authorId;

    @Column(nullable = false, length = 40)
    public String displayName;

    @Column(nullable = false, length = 512)
    public String passwordHash;

    @Lob
    @Column
    public String avatar = "/img/default-mascot.png";

    @Column(length = 254)
    public String email;

    public LocalDateTime lastModifiedAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
