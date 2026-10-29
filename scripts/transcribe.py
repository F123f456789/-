import json, os, sys
from pathlib import Path

audio, output, model_path = sys.argv[1:4]
def progress(text):
    print(json.dumps({'progress': text}, ensure_ascii=False), flush=True)

from faster_whisper import WhisperModel
import ctranslate2
device = 'cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
progress('正在加载本地语音模型（' + ('显卡' if device == 'cuda' else '处理器') + '）…')
try:
    model = WhisperModel(model_path, device=device, compute_type='float16' if device == 'cuda' else 'int8', local_files_only=True)
    segments, info = model.transcribe(audio, beam_size=5, vad_filter=True, condition_on_previous_text=False)
    rows=[]
    for s in segments:
        rows.append({'start':s.start,'end':s.end,'text':s.text.strip(),'noSpeechProbability':s.no_speech_prob,'uncertain':s.avg_logprob < -0.8})
        progress('已识别至 ' + str(round(s.end)) + ' 秒')
except RuntimeError:
    if device != 'cuda':
        raise
    progress('显卡运行库不可用，正在使用处理器继续识别…')
    model = WhisperModel(model_path, device='cpu', compute_type='int8', local_files_only=True)
    segments, info = model.transcribe(audio, beam_size=3, vad_filter=True, condition_on_previous_text=False)
    rows=[]
    for s in segments:
        rows.append({'start':s.start,'end':s.end,'text':s.text.strip(),'noSpeechProbability':s.no_speech_prob,'uncertain':s.avg_logprob < -0.8})
        progress('已识别至 ' + str(round(s.end)) + ' 秒')
result={'segments':rows,'text':'\n'.join(f"[{r['start']:.1f}–{r['end']:.1f}s] {r['text']}" for r in rows),'language':info.language,'source':'本地 faster-whisper 自动识别，需人工校对'}
Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
