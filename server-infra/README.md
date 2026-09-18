# production-infra

Windows 프로덕션 서버(`forum.rjsgud.com`, `gacha.rjsgud.com`)의 인증서 자동 갱신 스크립트와 구성 문서.

## 인증서 자동 갱신

매일 09:00에 Windows 작업 `win-acme-renew`가 아래 스크립트를 실행한다.

| 파일 | 역할 |
|------|------|
| `scripts/renew-certs.ps1` | `wacs.exe --renew` 후 Nginx reload |
| `scripts/reload-nginx.ps1` | Nginx 설정 검사 후 reload |
| `scripts/register-scheduled-task.ps1` | 스케줄 작업 등록 |

수동 갱신:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\deploy\server-infra\scripts\renew-certs.ps1 -Force
```

스케줄 재등록:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\deploy\server-infra\scripts\register-scheduled-task.ps1
```

서버 구성 전체는 [PRODUCTION.md](./PRODUCTION.md)를 참고한다.
