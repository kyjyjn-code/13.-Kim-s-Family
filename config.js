// config.js — 사이트 설정 (사용자가 직접 편집)
window.CONFIG = {
  // 사이트 제목 / 부제
  siteTitle: "김영진 💛 구경림 가족 일기",
  siteSubtitle: "하나님을 사랑하는 우리 가족의, 주님께 인도받는 시간들의 기록",

  // "함께한 지 N일째" 기준일 (결혼기념일). YYYY-MM-DD
  anniversaryDate: "2022-10-08",

  // 헤더 카운터 (좌우로 나열). 각 항목: 라벨 + 기준일. 원하면 추가/수정하세요.
  counters: [
    { label: "💛 우리 결혼", date: "2022-10-08" },
    { label: "🧸 첫째 은호", date: "2024-05-19" },
    { label: "🧸 둘째 은혁", date: "2026-02-21" }
  ],

  // ── Supabase 연결 (anon 키는 공개돼도 안전 — 보안은 로그인+RLS가 담당) ──
  supabaseUrl: "https://qlgiwdwjjbldwjorpkiy.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsZ2l3ZHdqamJsZHdqb3Jwa2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NjY2NjQsImV4cCI6MjA5OTU0MjY2NH0.H5SpKEL-6iwihsgKkHa1tC4L7VAaj9anORWWUcKxI58",

  // 구성원(추가 폼 체크박스). 필요하면 여기에 이름을 더하세요.
  members: ["아빠", "엄마", "첫째", "둘째"],

  // 사진 자동 최적화 — 고화질을 올려도 브라우저에서 저용량으로 줄여 저장(원본은 안 올라감).
  //  · maxEdge: 본문사진 긴 변 최대 px  · quality: JPEG 품질(0~1)
  //  숫자를 낮출수록 용량↓(더 절약). 화질을 더 원하면 maxEdge를 키우세요.
  photo: { maxEdge: 1440, quality: 0.8, thumbEdge: 360, thumbQuality: 0.7 },

  // 캘린더 '일정' 카테고리 (연대기 카테고리와 별개)
  scheduleCategories: {
    "생일":      { emoji: "🎂", color: "#e79ab0" },
    "병원":      { emoji: "🏥", color: "#c05b5b" },
    "기념일":    { emoji: "💐", color: "#d98aa0" },
    "여행":      { emoji: "✈️", color: "#4e8c9a" },
    "학교·원":   { emoji: "🎒", color: "#6d9bd0" },
    "모임·약속": { emoji: "👥", color: "#7bb07a" },
    "행사":      { emoji: "🎉", color: "#9b8bd0" },
    "납부·비용": { emoji: "💰", color: "#c99a5b" },
    "기타":      { emoji: "📌", color: "#9a8f7a" }
  },

  // 연대기(타임라인) 카테고리 정의: 값 -> { emoji, color }
  categories: {
    "아이들":    { emoji: "🧸", color: "#c98a3a" },
    "집":        { emoji: "🏠", color: "#7a8a6a" },
    "직장":      { emoji: "🏢", color: "#5f7a8c" },
    "건강":      { emoji: "🏥", color: "#c05b5b" },
    "여행":      { emoji: "✈️", color: "#4e8c9a" },
    "결혼":      { emoji: "💍", color: "#e79ab0" },
    "교회":      { emoji: "⛪", color: "#9b8bd0" },
    "취미":      { emoji: "🎨", color: "#c99a5b" },
    "골프":      { emoji: "⛳", color: "#7bb07a" },
    "학교·유학": { emoji: "📚", color: "#6d9bd0" },
    "재정":      { emoji: "💰", color: "#8c7ab0" },
    "기타":      { emoji: "⭐", color: "#9a8f7a" }
  }
};
