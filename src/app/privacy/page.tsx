import type { Metadata } from 'next';
import { LegalShell, H2, P, LI } from '@/components/LegalShell';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: 'InvestK 개인정보처리방침',
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell title="개인정보처리방침" updated="2026년 7월 10일">
      <P>
        InvestK(이하 &ldquo;서비스&rdquo;, 운영: 트루)은 이용자의 개인정보를 중요하게 생각하며, 관련 법령을 준수합니다.
        본 방침은 서비스가 어떤 정보를 수집·이용·보관하는지 설명합니다.
      </P>

      <H2>1. 수집하는 항목</H2>
      <ul>
        <LI><b>카카오 로그인 시</b>: 카카오로부터 회원번호(고유 식별자)와 닉네임을 제공받습니다.</LI>
        <LI><b>선택</b>: 가입 시 입력한 메모</LI>
        <LI><b>서비스 이용 중 생성</b>: 보유 종목·관심 종목·알림 설정 등 이용자가 직접 입력·저장한 정보</LI>
        <LI><b>자동 수집</b>: 접속 IP, 기기·브라우저 정보, 쿠키, 서비스 이용 기록(방문 페이지 등), Google Analytics 분석 데이터, 광고 식별용 쿠키(카카오 애드핏)</LI>
      </ul>

      <H2>2. 이용 목적</H2>
      <ul>
        <LI>회원 식별 및 로그인 유지</LI>
        <LI>개인화 기능 제공(포트폴리오 평가, 알림, 관심 종목)</LI>
        <LI>서비스 품질 개선 및 이용 통계 분석</LI>
        <LI>광고 게재</LI>
      </ul>

      <H2>3. 보유 및 파기</H2>
      <P>
        개인정보는 회원 탈퇴 또는 계정 삭제 시 지체 없이 파기합니다. 다만 관련 법령에서 보존을 요구하는 경우 해당 기간 동안 보관 후 파기합니다.
      </P>

      <H2>4. 처리 위탁 및 제3자</H2>
      <P>서비스는 개인정보를 제3자에게 판매하지 않습니다. 다만 서비스 운영을 위해 아래 사업자에 처리를 위탁(또는 데이터 전송)할 수 있습니다.</P>
      <ul>
        <LI><b>Kakao</b> — 소셜 로그인(카카오 계정 인증)</LI>
        <LI><b>Vercel</b> — 웹 호스팅</LI>
        <LI><b>Supabase</b> — 데이터베이스(계정·설정 저장)</LI>
        <LI><b>Google Analytics</b> — 이용 통계 분석</LI>
        <LI><b>Kakao AdFit</b> — 광고 게재</LI>
        <LI><b>Anthropic(Claude API)</b> — AI 분석·보고서 생성. &ldquo;투자 보고서&rdquo; 기능 이용 시, 이용자가 입력한 포트폴리오 요약(종목명·비중·손익)이 보고서 작성을 위해 전송됩니다.</LI>
      </ul>

      <H2>5. 쿠키·분석·광고</H2>
      <P>
        서비스는 로그인 유지·이용 분석·광고를 위해 쿠키를 사용합니다. 브라우저 설정에서 쿠키를 거부할 수 있으나, 이 경우 일부 기능이 제한될 수 있습니다.
        Google Analytics 수집은 구글의 <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer" style={{ color: 'var(--c-accyanbr)' }}>차단 부가기능</a>으로,
        광고 개인화는 <a href="https://adssettings.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--c-accyanbr)' }}>구글 광고 설정</a> 등에서 거부할 수 있습니다.
      </P>

      <H2>6. 이용자의 권리</H2>
      <P>이용자는 언제든 자신의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다. 계정 삭제는 서비스 내 또는 아래 문의처를 통해 가능합니다.</P>

      <H2>7. 문의처</H2>
      <P>운영: 트루 · 이메일: chazloofficial@gmail.com</P>

      <H2>8. 고지</H2>
      <P>본 방침이 변경되는 경우 서비스 내 공지를 통해 알립니다.</P>
    </LegalShell>
  );
}
