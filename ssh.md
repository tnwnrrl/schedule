# NAS 배포 명령어

## 접속
```bash
ssh -p 55 tnwnrrl@192.168.219.187
# 비밀번호: Aksksla12!
```

## 배포 (자동)
```bash
expect -c '
set timeout 300
spawn sshpass -p "Aksksla12!" ssh -p 55 -tt tnwnrrl@192.168.219.187 "sudo env PATH=/volume2/@appstore/Docker/usr/bin:/usr/local/bin:/usr/bin:\$PATH /volume2/@appstore/Docker/usr/bin/docker-compose -f \"/volume1/Synology Driver/일산 신규 프로젝트/장치/schedule/docker-compose.yml\" up -d --build 2>&1"
expect {
    "Password:" { send "Aksksla12!\r"; exp_continue }
    timeout { puts "TIMEOUT"; exit 1 }
    eof
}
'
```

## 배포 (수동)
```bash
ssh -p 55 tnwnrrl@192.168.219.187

cd "/volume1/Synology Driver/일산 신규 프로젝트/장치/schedule"
sudo docker-compose down && sudo docker-compose up -d --build
```

## 로그 확인
```bash
sudo docker logs schedule --tail 50
```

## 시드 데이터 (최초 1회)
```bash
sudo docker exec schedule npx prisma db seed
```

## 접속 URL
- 내부: http://192.168.219.187:3100
- 외부: 시놀로지 포트포워딩 설정 필요
