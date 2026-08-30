import React from 'react'
import { useQuranCardDownloads } from '../../hooks/useQuranCardDownloads.mjs'
import {
  cardAudioUrl,
  cardAudioFileName,
  cardPdfUrl,
  cardPdfFileName,
  cardYouTube,
  getCardByNumber,
} from '../../services/quranCards.mjs'
import * as quranCardDownload from '../../services/quranCardDownload.mjs'
import { usePlayer } from '../../hooks/usePlayer.mjs'
import { isCordova } from '../../services/device.mjs'
import { Icon } from '../ui/Icon.jsx'

function openExternal(url) {
  if (window.cordova?.InAppBrowser?.open) {
    window.cordova.InAppBrowser.open(url, '_system')
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

export function QuranCardMedia({ number }) {
  const downloads = useQuranCardDownloads()
  const player = usePlayer()
  const card = getCardByNumber(number)

  const audioUrl = cardAudioUrl(number)
  const audioFileName = cardAudioFileName(number)
  const pdfUrl = cardPdfUrl(number)
  const pdfFileName = cardPdfFileName(number)
  const youtube = cardYouTube(number)

  const audioRef = `quran-card-audio-${number}`
  const pdfRef = `quran-card-pdf-${number}`

  const audioTask = downloads[audioRef]
  const pdfTask = downloads[pdfRef]

  const audioStored = audioFileName ? quranCardDownload.isStored(audioFileName) : false
  const pdfStored = pdfFileName ? quranCardDownload.isStored(pdfFileName) : false

  const audioBusy = audioTask?.state === 'pending' || audioTask?.state === 'running'
  const pdfBusy = pdfTask?.state === 'pending' || pdfTask?.state === 'running'

  const audioError = audioTask?.state === 'error' ? audioTask.error : null
  const pdfError = pdfTask?.state === 'error' ? pdfTask.error : null

  const audioPercent =
    audioTask && Number.isFinite(audioTask.progress) && audioTask.progress >= 0
      ? Math.round(audioTask.progress * 100)
      : 0
  const pdfPercent =
    pdfTask && Number.isFinite(pdfTask.progress) && pdfTask.progress >= 0
      ? Math.round(pdfTask.progress * 100)
      : 0

  const isThisPlaying =
    player.track?.kind === 'quranCard' &&
    player.track?.number === number &&
    player.playing

  const isThisPaused =
    player.track?.kind === 'quranCard' &&
    player.track?.number === number &&
    !player.playing &&
    player.status !== 'idle'

  const onPlayAudio = () => {
    if (player.track?.kind === 'quranCard' && player.track?.number === number) {
      player.toggle()
      return
    }
    const track = {
      kind: 'quranCard',
      number,
      name: card?.name_arabic,
      nameEnglish: card?.name_english,
      url: audioUrl,
      fileName: audioFileName,
    }
    player.play([track], 0)
  }

  const onToggleAudioDownload = (e) => {
    e.stopPropagation()
    if (audioStored) {
      quranCardDownload.removeFile(audioRef, audioFileName)
    } else if (audioBusy) {
      quranCardDownload.cancelRef(audioRef)
    } else if (isCordova()) {
      quranCardDownload.downloadAudio(number, audioUrl, audioFileName)
    } else {
      openExternal(audioUrl)
    }
  }

  const onOpenPdf = (e) => {
    e.stopPropagation()
    if (pdfStored) {
      quranCardDownload.openPdf(number).then((res) => {
        if (!res.ok) openExternal(pdfUrl)
      })
    } else if (pdfUrl) {
      openExternal(pdfUrl)
    }
  }

  const onTogglePdfDownload = (e) => {
    e.stopPropagation()
    if (pdfStored) {
      quranCardDownload.removeFile(pdfRef, pdfFileName)
    } else if (pdfBusy) {
      quranCardDownload.cancelRef(pdfRef)
    } else if (isCordova()) {
      quranCardDownload.downloadPdf(number, pdfUrl, pdfFileName)
    } else {
      openExternal(pdfUrl)
    }
  }

  const onOpenYouTube = (e) => {
    e.stopPropagation()
    if (youtube?.url) {
      openExternal(youtube.url)
    }
  }

  return (
    <div className="qcards-media">
      <div className="qcards-media__row">
        {/* Audio mini card */}
        <div className="qcards-media__mini">
          <button
            className={
              'qcards-media__play' +
              (isThisPlaying ? ' qcards-media__play--active' : '') +
              (isThisPaused ? ' qcards-media__play--paused' : '')
            }
            onClick={onPlayAudio}
            type="button"
            aria-label={isThisPlaying ? 'إيقاف' : 'تشغيل'}
          >
            <Icon name={isThisPlaying ? 'pause' : 'play'} size={18} />
          </button>
          <span className="qcards-media__label">صوت</span>
          {isCordova() ? (
            <button
              className={
                'qcards-media__mini-dl' +
                (audioStored ? ' qcards-media__mini-dl--stored' : '') +
                (audioBusy ? ' qcards-media__mini-dl--busy' : '')
              }
              onClick={onToggleAudioDownload}
              type="button"
              aria-label={audioStored ? 'حذف' : 'تحميل'}
            >
              {audioStored ? (
                <Icon name="trash" size={14} />
              ) : audioBusy ? (
                <span className="qcards-media__spin" />
              ) : audioError ? (
                <Icon name="refresh" size={14} />
              ) : (
                <Icon name="download" size={14} />
              )}
            </button>
          ) : (
            <a
              className="qcards-media__mini-dl qcards-media__mini-dl--link"
              href={audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="فتح الصوت"
            >
              <Icon name="external" size={14} />
            </a>
          )}
          {audioBusy && (
            <div className="qcards-media__mini-progress">
              <span style={{ width: `${audioPercent}%` }} />
            </div>
          )}
        </div>

        {/* PDF mini card */}
        <div className="qcards-media__mini">
          <button
            className="qcards-media__pdf-btn"
            onClick={onOpenPdf}
            type="button"
            aria-label="فتح PDF"
          >
            <Icon name="file-pdf" size={18} />
          </button>
          <span className="qcards-media__label">PDF</span>
          {isCordova() ? (
            <button
              className={
                'qcards-media__mini-dl' +
                (pdfStored ? ' qcards-media__mini-dl--stored' : '') +
                (pdfBusy ? ' qcards-media__mini-dl--busy' : '') +
                (pdfError ? ' qcards-media__mini-dl--error' : '')
              }
              onClick={onTogglePdfDownload}
              type="button"
              aria-label={pdfStored ? 'حذف' : 'تحميل'}
            >
              {pdfStored ? (
                <Icon name="trash" size={14} />
              ) : pdfBusy ? (
                <span className="qcards-media__spin" />
              ) : pdfError ? (
                <Icon name="refresh" size={14} />
              ) : (
                <Icon name="download" size={14} />
              )}
            </button>
          ) : (
            <a
              className="qcards-media__mini-dl qcards-media__mini-dl--link"
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="فتح PDF"
            >
              <Icon name="external" size={14} />
            </a>
          )}
          {pdfBusy && (
            <div className="qcards-media__mini-progress">
              <span style={{ width: `${pdfPercent}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Status line */}
      {isThisPlaying && (
        <div className="qcards-media__status qcards-media__status--live">
          <span className="qcards-media__dot" />
          <span>{card?.name_arabic} — يعمل الآن</span>
        </div>
      )}
      {isThisPaused && (
        <div className="qcards-media__status">
          <span>{card?.name_arabic} — متوقف مؤقتاً</span>
        </div>
      )}

      {/* YouTube */}
      {youtube && (
        <button
          className="qcards-media__youtube"
          onClick={onOpenYouTube}
          type="button"
        >
          <Icon name="play" size={14} />
          <span>مشاهدة البطاقة على يوتيوب</span>
        </button>
      )}
    </div>
  )
}
