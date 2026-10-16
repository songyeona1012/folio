// 폴리오 서버를 시작하고 스프링 설정을 불러옵니다.
package com.example.folio;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class FolioApplication {

    public static void main(String[] args) {
        SpringApplication.run(FolioApplication.class, args);
    }
}
