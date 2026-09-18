# 프로덕션 서버 정리

작성일: 2026-09-18  
서버: Windows (`C:\` 루트에 인프라 + `C:\deploy`에 앱)

지금 **외부에 열려 있는 프로덕션 웹 프로젝트는 2개**다.

| # | 도메인 | 앱 | 배포 경로 | 현재 상태 |
|---|--------|----|-----------|-----------|
| 1 | https://forum.rjsgud.com | 포럼 (프론트 Next.js + 백엔드 Spring Boot) | `C:\deploy\forum` | 프로세스 기동 중 (NSSM) |
| 2 | https://gacha.rjsgud.com | 가챠 수집가 (React + Express) | `C:\deploy\gitjuyoung\송주영` | 프로세스 기동 중 (콘솔 `npm run server`) |

Nginx `server_name` 기준으로도 위 2개만 연결되어 있다.

---

## 한눈에 보는 구조

```
인터넷
  │
  ▼
Nginx  :80 / :443     ← 웹서버 + HTTPS 종료 + 리버스 프록시
  │
  ├─ forum.rjsgud.com
  │     /          → 127.0.0.1:3000   forum-frontend (Next.js)
  │     /api /ws   → 127.0.0.1:8081   forum-backend  (Java app.jar)
  │     /uploads   → C:\app-data\uploads
  │
  └─ gacha.rjsgud.com
        /          → 127.0.0.1:8787   gacha Express + 정적 dist

MySQL  :3306          ← 공통 DB
Jenkins :8000         ← CI (Nginx에 안 묶여 있음, 공개 사이트가 아님)
```

---

## 1. 포럼 — `forum.rjsgud.com`

경로: `C:\deploy\forum`

| 구분 | 내용 |
|------|------|
| 프론트 | Next.js 14 (`forum_front`), 포트 **3000** |
| 백엔드 | Spring Boot JAR `C:\deploy\forum\backend\app.jar`, 포트 **8081** |
| 업로드 | Nginx가 `C:\app-data\uploads\`를 `/uploads/`로 직접 서빙 |
| 기동 방식 | **NSSM Windows 서비스** (자동 시작) |
| 서비스 이름 | `forum-frontend`, `forum-backend` |

NSSM 설정:

- `forum-frontend`: `node.exe` + `next start -p 3000`, 작업 폴더 `C:\deploy\forum\frontend`
- `forum-backend`: `java.exe -jar app.jar`, 작업 폴더 `C:\deploy\forum\backend`

재부팅해도 포럼은 서비스가 다시 올려 준다.

---

## 2. 가챠 수집가 — `gacha.rjsgud.com`

경로: `C:\deploy\gitjuyoung\송주영`  
GitHub: https://github.com/rjsgud49/gitjuyoung.git  
패키지명: `gacha-collector`

| 구분 | 내용 |
|------|------|
| 프론트 | React + Vite 빌드 (`dist/`) |
| API | Express (`tsx server/index.ts`), 포트 **8787** |
| DB | MySQL `gacha` |
| 기동 방식 | NSSM **아님**. 콘솔에서 `npm run server`로 떠 있음 |

가챠는 포럼과 달리 Windows 서비스가 아니다. 콘솔을 닫거나 재부팅하면 꺼질 수 있다. 무중단(상시 기동)으로 맞추려면 포럼처럼 NSSM 서비스로 등록해야 한다.

---

## 인프라 폴더가 하는 일

`C:\` 바로 아래에 앱이 아니라 **서버 부품**이 모여 있다.

### Nginx — 웹서버 / 리버스 프록시

- 설치: `C:\Nginx\nginx-1.28.0`
- 설정: `C:\Nginx\nginx-1.28.0\conf\nginx.conf`
- 인증서 PEM: `C:\Nginx\ssl\`

하는 일:

1. 80 → 443 HTTPS 리다이렉트
2. HTTPS 인증서 적용
3. 도메인별로 내부 포트로 넘김 (3000 / 8081 / 8787)
4. Let’s Encrypt 검증용 `/.well-known/acme-challenge/` 파일 제공

현재 Nginx는 **Windows 서비스가 아니다**. 프로세스는 살아 있지만 NSSM에 안 올라가 있어서, 재부팅 후 수동 기동이 필요할 수 있다.

### NSSM — Windows 서비스로 감싸는 도구

경로: `C:\nssm\nssm.exe`  
이름 뜻: Non-Sucking Service Manager

Node/Java 같은 콘솔 프로그램을 **Windows 서비스**로 등록해서,

- 부팅 시 자동 시작
- 프로세스가 죽으면 다시 시작

하도록 쓰는 도구다.

흔히 말하는 블루/그린 무중단 배포(교체하는 동안 트래픽을 끊지 않는 것)는 아니다. **항상 켜 두기 / 죽으면 다시 켜기**에 가깝다.

지금 NSSM으로 등록된 서비스는 포럼 2개뿐이다.

| 서비스 | 상태 | 시작 유형 |
|--------|------|-----------|
| forum-backend | Running | Auto |
| forum-frontend | Running | Auto |

### certificate (`C:\certificates`) — ACME 검증 파일 루트

Let’s Encrypt가 “이 도메인이 정말 네 서버냐?”를 확인할 때 쓰는 **임시 파일을 두는 폴더**다.

Nginx는 이렇게 연결한다.

```
location /.well-known/acme-challenge/ {
    root C:/certificates;
}
```

실제 파일 위치:

`C:\certificates\.well-known\acme-challenge\`

브라우저/Let’s Encrypt가 `http://도메인/.well-known/acme-challenge/토큰` 을 요청하면, 이 폴더의 파일을 그대로 보여 준다.

인증서가 발급된 뒤에는 보통 비어 있고, 갱신할 때만 파일이 잠깐 생긴다. 지금 있는 `test.txt`는 수동 테스트용이다.

### acme-challenge 가 뭔지

**ACME** = Automatic Certificate Management Environment. Let’s Encrypt가 인증서를 발급/갱신할 때 쓰는 프로토콜이다.

**HTTP-01 챌린지** 흐름:

1. win-acme가 Let’s Encrypt에 “`forum.rjsgud.com` 인증서 주세요”라고 요청
2. Let’s Encrypt가 랜덤 토큰을 줌
3. 그 토큰 파일을 `http://forum.rjsgud.com/.well-known/acme-challenge/토큰` 으로 공개
4. Let’s Encrypt 서버가 그 URL을 조회해서 내용이 맞으면 **도메인 소유 확인 완료**
5. 인증서 발급 → `C:\Nginx\ssl\` 에 PEM 저장

그래서 폴더 이름이 `acme-challenge`다. 웹 앱 코드가 아니라 **인증서 발급용 증거 파일 자리**다.

참고로 아래 두 폴더는 설정 실습 때 남은 **빈 잔여 폴더**다. Nginx는 쓰지 않는다.

- `C:\acme-challenge` (비어 있음)
- `C:\certificates.well-known` (비어 있음, 이름만 비슷한 오설정 흔적)

실제로 쓰는 경로는 `C:\certificates\.well-known\acme-challenge\` 뿐이다.

### win-acme — Windows용 Let’s Encrypt 클라이언트

Let’s Encrypt와 대화해서 인증서를 받아 오는 프로그램이다. 실행 파일 이름은 보통 `wacs.exe`.

이 서버에서의 위치:

| 구분 | 경로 |
|------|------|
| 본체 | `C:\win-acme\wacs.exe` |
| 백업 배포본 | `C:\Users\rjsgud49\Desktop\win-acme.v2.2.9.1701.x64.trimmed\wacs.exe` |
| 갱신 기록/상태 | `C:\ProgramData\win-acme\` |
| 자동 갱신 스크립트 | `C:\deploy\server-infra\scripts\` |

발급된 인증서 2개:

| 도메인 | 검증 경로 | PEM 저장 위치 |
|--------|-----------|----------------|
| forum.rjsgud.com | `C:\certificates` | `C:\Nginx\ssl\forum.rjsgud.com-*.pem` |
| gacha.rjsgud.com | `C:\certificates` | `C:\Nginx\ssl\gacha.rjsgud.com-*.pem` |

Let’s Encrypt 인증서는 90일짜리다. 만료 전에 자동 갱신되도록 Windows 작업 스케줄러가 매일 09:00에 스크립트를 돌린다.

### 인증서 자동 갱신

| 항목 | 값 |
|------|----|
| 작업 이름 | `win-acme-renew` |
| 실행 시각 | 매일 09:00 |
| 실행 계정 | `rjsgud49` (win-acme 암호가 이 계정 DPAPI에 묶여 있음) |
| 스크립트 | `C:\deploy\server-infra\scripts\renew-certs.ps1` |
| 동작 | `wacs.exe --renew` → Nginx 설정 검사 → `nginx -s reload` |
| 로그 | `C:\deploy\server-infra\logs\renew-*.log` |

수동 갱신:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\deploy\server-infra\scripts\renew-certs.ps1 -Force
```

스케줄 재등록:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\deploy\server-infra\scripts\register-scheduled-task.ps1
```

---

## 인증서 상태

2026-09-18에 만료본을 강제 갱신했다. 유효기간은 **2026-12-17**까지, 다음 자동 갱신 예정은 **2026-11-12** 이후.

| 도메인 | 이전 만료 | 현재 notAfter | 다음 자동 갱신 |
|--------|-----------|---------------|----------------|
| forum.rjsgud.com | 2026-08-21 | 2026-12-17 | 2026-11-12 |
| gacha.rjsgud.com | 2026-08-10 | 2026-12-17 | 2026-11-12 |

---

## 지금 열려 있는 포트

| 포트 | 프로세스 | 역할 |
|------|----------|------|
| 80 | nginx | HTTP (ACME + HTTPS 리다이렉트) |
| 443 | nginx | HTTPS |
| 3000 | node (NSSM) | 포럼 프론트 |
| 8081 | java (NSSM) | 포럼 백엔드 |
| 8787 | node (콘솔) | 가챠 API + 정적 파일 |
| 3306 | mysqld | MySQL 8.0 |
| 8000 | java (Jenkins) | Jenkins CI |

Nginx에 안 묶인 것:

- **Jenkins** — Windows 서비스 `Jenkins`, 자동 시작. 공개 웹 프로젝트가 아님.
- 콘솔 `npm start` → `node src/index.js` 하나 더 떠 있음. Nginx에 없고 `C:\deploy`에도 없음. 프로덕션 사이트로 보지 않음.

---

## 재부팅 시 무엇이 살아나나

| 구성 | 자동 기동 |
|------|-----------|
| 포럼 프론트/백엔드 (NSSM) | O |
| MySQL | O |
| Jenkins | O |
| Nginx | X (서비스 아님, 수동) |
| 가챠 | X (콘솔 실행) |
| win-acme 인증서 갱신 작업 | O (`win-acme-renew`, 사용자 로그온 필요) |

---

## 폴더 지도

```
C:\
├── deploy\                 프로덕션 앱 소스/빌드
│   ├── forum\              포럼
│   │   ├── frontend\       Next.js
│   │   └── backend\        app.jar
│   ├── gitjuyoung\         가챠 (송주영)
│   ├── server-infra\       인증서 자동 갱신 스크립트 / 문서
│   └── PRODUCTION.md       이 문서
├── Nginx\                  웹서버
│   ├── nginx-1.28.0\
│   └── ssl\                실제 HTTPS 인증서
├── nssm\                   서비스 등록 도구 (nssm.exe만 있음)
├── certificates\           ACME HTTP-01 검증 루트 (실제 사용)
├── acme-challenge\         빈 잔여 폴더
├── certificates.well-known\ 빈 잔여 폴더
├── win-acme\               Let’s Encrypt 클라이언트 (wacs.exe)
├── app-data\uploads\       포럼 업로드 파일
└── ProgramData\win-acme\   인증서 갱신 상태
```
