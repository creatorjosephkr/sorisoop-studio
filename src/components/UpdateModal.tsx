import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  Rocket,
  Sparkles,
  X,
} from 'lucide-react';
import appIconUrl from '../../app-icon.png';
import { UpdateCheckResult } from '../types';

interface UpdateModalProps {
  isOpen: boolean;
  isChecking: boolean;
  result: UpdateCheckResult | null;
  onClose: () => void;
  onRecheck: () => void;
}

const REPO_URL = 'https://github.com/creatorjosephkr/sorisoop-studio';
const RELEASES_URL = 'https://github.com/creatorjosephkr/sorisoop-studio/releases/latest';

function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input']);
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (blockedTags.has(tag)) {
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim();
        if (name.startsWith('on')) {
          child.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src') && !/^https?:\/\//i.test(val)) {
          child.removeAttribute(attr.name);
        }
      }
      if (tag === 'a') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

function formatInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

function renderReleaseNotesHtml(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeLists();
      continue;
    }

    if (/^<\/?(ul|ol|li|p|div|h[1-6]|blockquote|details|summary|pre|table|tr|td|th|hr|br)\b/i.test(trimmed)) {
      closeLists();
      out.push(formatInlineMarkdown(trimmed));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      closeLists();
      out.push('<hr />');
      continue;
    }

    const bqMatch = trimmed.match(/^>\s?(.*)$/);
    if (bqMatch) {
      closeLists();
      out.push(`<blockquote>${formatInlineMarkdown(bqMatch[1])}</blockquote>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${formatInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${formatInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    out.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  }

  closeLists();
  return sanitizeHtml(out.join('\n'));
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  isChecking,
  result,
  onClose,
  onRecheck,
}) => {
  if (!isOpen) return null;

  const openUrl = (url: string) => {
    if (window.electronAPI?.openExternalUrl) {
      void window.electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const hasUpdate = !isChecking && result?.status === 'update-available';
  const isUpToDate = !isChecking && result?.status === 'up-to-date';
  const isError = !isChecking && result?.status === 'error';

  const publishedDate = result?.publishedAt
    ? new Date(result.publishedAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl"
      >
        {/* 상단 그라데이션 배너 */}
        <div className="relative border-b border-slate-800 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-emerald-500/15 px-5 pt-5 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
            aria-label="업데이트 창 닫기"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-950/80 p-1 shadow-lg">
              <img
                src={appIconUrl}
                alt="소리숲 뮤직비디오 스튜디오"
                className="h-full w-full rounded-xl object-contain"
              />
              {hasUpdate && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow">
                  <Sparkles className="h-2.5 w-2.5" />
                </span>
              )}
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                {isChecking ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    GitHub 릴리즈 확인 중
                  </>
                ) : hasUpdate ? (
                  <>
                    <Rocket className="h-3 w-3 text-emerald-300" />새 업데이트가 있습니다
                  </>
                ) : isUpToDate ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                    최신 버전 사용 중
                  </>
                ) : (
                  <span>업데이트 확인</span>
                )}
              </div>
              <h2 className="mt-1.5 text-base font-bold text-slate-100">
                {isChecking
                  ? '새 버전을 확인하고 있습니다...'
                  : hasUpdate
                    ? result?.releaseName || `소리숲 스튜디오 v${result?.latestVersion}`
                    : isUpToDate
                      ? '현재 최신 버전이 설치되어 있습니다'
                      : '업데이트 정보를 가져오지 못했습니다'}
              </h2>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="space-y-3.5 p-5 text-xs">
          {/* 버전 비교 카드 */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-3">
            <div>
              <p className="text-[10px] text-slate-400">현재 버전</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-200">
                v{result?.currentVersion ?? '1.0.0'}
              </p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-500" />

            <div className="text-right">
              <p className="text-[10px] text-slate-400">최신 릴리즈</p>
              <p
                className={`mt-0.5 font-mono text-sm font-bold ${
                  hasUpdate ? 'text-emerald-300' : 'text-cyan-300'
                }`}
              >
                {isChecking
                  ? '확인 중...'
                  : result?.latestVersion
                    ? `v${result.latestVersion}`
                    : `v${result?.currentVersion ?? '1.0.0'}`}
              </p>
            </div>
          </div>

          {publishedDate && hasUpdate && (
            <p className="text-right text-[10px] text-slate-400">배포일: {publishedDate}</p>
          )}

          {/* 릴리즈 노트 (Markdown + HTML 지원) */}
          {hasUpdate && result?.releaseNotes && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-300">변경 사항 (Release Notes)</p>
              <div
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const anchor = target.closest('a');
                  if (anchor) {
                    const href = anchor.getAttribute('href');
                    if (href && /^https?:\/\//i.test(href)) {
                      e.preventDefault();
                      openUrl(href);
                    }
                  }
                }}
                dangerouslySetInnerHTML={{
                  __html: renderReleaseNotesHtml(result.releaseNotes),
                }}
                className="max-h-44 overflow-y-auto space-y-1.5 text-[11px] leading-relaxed text-slate-300 [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-slate-100 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-cyan-300 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:text-emerald-300 [&_h4]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5 [&_strong]:font-semibold [&_strong]:text-slate-100 [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-cyan-200 [&_a]:text-cyan-300 [&_a]:underline hover:[&_a]:text-cyan-200 [&_blockquote]:border-l-2 [&_blockquote]:border-cyan-500/60 [&_blockquote]:pl-2.5 [&_blockquote]:text-slate-400 [&_hr]:border-slate-800 [&_img]:max-w-full [&_img]:rounded-lg"
              />
            </div>
          )}

          {isUpToDate && result?.errorMessage && (
            <p className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-[11px] text-slate-400">
              {result.errorMessage}
            </p>
          )}

          {isError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[11px] text-rose-200">
              {result?.errorMessage || '네트워크 연결 상태를 확인한 뒤 다시 시도해 주세요.'}
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex flex-col gap-2 pt-1">
            {hasUpdate && (
              <button
                type="button"
                onClick={() => openUrl(result?.downloadUrl || result?.releaseUrl || RELEASES_URL)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-cyan-400 hover:to-emerald-400"
              >
                <Download className="h-4 w-4" />
                최신 버전 다운로드
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openUrl(result?.releaseUrl || REPO_URL)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 py-2 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
              >
                <ExternalLink className="h-3.5 w-3.5 text-cyan-300" />
                저장소 바로가기
              </button>

              {hasUpdate ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-700 bg-slate-950 py-2 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
                >
                  나중에
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRecheck}
                  disabled={isChecking}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 py-2 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  다시 확인
                </button>
              )}
            </div>

            {!hasUpdate && (
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-slate-800 py-2 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
              >
                확인
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
