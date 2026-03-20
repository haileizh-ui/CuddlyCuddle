import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, 
  Settings, 
  MessageSquare,
  Sparkles,
  Loader2,
  User,
  ImagePlus,
  ChevronLeft,
  Trash2,
  X,
  Download,
  ZoomIn,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Wand2,
  Image,
  FileText,
  Video,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

// API 响应类型
interface ApiResponse {
  message: string;
  voice_message_url: string;
  video_url: string;
  background_url: string;
  char_id: string;
  char_illu_url: string;
  char_name: string;
  char_avatar_url: string;
  description: string;
  personality: string;
  first_mes: string;
  creator: string;
  source: string;
  feed_id: string;
  voice_model_id: string;
  processing: number;
}

// VoiceItem 接口
interface VoiceItem {
  modelId: string;
  title: string;
  description: string;
  isPersonal: boolean;
  created_at: string;
  updated_at: string;
}

// 消息类型
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  voice_message_url: string;
  video_url: string;
  timestamp: Date;
  char_id: string;
  background_url: string;
  char_illu_url: string;
  char_name: string;
  char_avatar_url: string;
}

// 背景类型
interface BackgroundConfig {
  type: 'image' | 'video';
  url: string;
}

// 角色配置
interface CharacterConfig {
  id: string;
  name: string;
  avatar: string;
  standImage: string;
}

interface CharacterDetail {
  id: string;
  name: string;
  avatar: string;
  description: string;
  personality: string;
  first_mes: string;
  creator: string;
  source: string;
  feed_id: string;
  voice_model_id: string;
}

// 上传进度类型
interface UploadProgress {
  [key: string]: number;
}

// 素材类型
interface GalleryImage {
  url: string;
  description: string;
  type?: 'image' | 'video';
}

// 视频生成状态类型
interface VideoGenerationStatus {
  videoUrl: string | null;
  progress: number;
  failed: boolean;
  error: string | null;
  msg_id?: string;
  char_illu_url?: string;
}

// 角色创建步骤类型
interface CreationStep {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'disabled';
  progress: number;
  estimatedTime: number; // 预计耗时（秒）
}

// 角色创建状态类型
interface CharacterCreationStatus {
  isCreating: boolean;
  steps: CreationStep[];
  currentStepIndex: number;
  overallProgress: number;
  message: string;
  error: string | null;
  charId: string;
}

// API 配置
const API_BASE_URL = 'https://danime.dawoai.com/v1/dialogue';
const API_IMAGE_URL = 'https://danime.dawoai.com/v1/image';

// 角色创建步骤配置
const CREATION_STEPS: Omit<CreationStep, 'status' | 'progress'>[] = [
  {
    id: 'design_report',
    name: '角色设计报告',
    description: '分析参考图片，生成角色设计文档',
    icon: FileText,
    estimatedTime: 60,
  },
  {
    id: 'character_card',
    name: '角色描述生成',
    description: '脑补人物性格、职业、成长背景等',
    icon: Wand2,
    estimatedTime: 30,
  },
  {
    id: 'character_illu',
    name: '角色立绘',
    description: '生成角色立绘（透明背景）',
    icon: Sparkles,
    estimatedTime: 10,
  },
  {
    id: 'background',
    name: '角色宇宙背景',
    description: '生成角色专属背景图片',
    icon: Image,
    estimatedTime: 60,
  },
  {
    id: 'character_image',
    name: '角色设定图',
    description: '生成角色设定图【可选】',
    icon: Image,
    estimatedTime: 60,
  },
  {
    id: 'video',
    name: '开场视频',
    description: '基于参考图片和开场白生成视频',
    icon: Video,
    estimatedTime: 60,
  },
];

// 角色创建进度组件
function CharacterCreationProgress({ 
  status, 
  onRetry 
}: { 
  status: CharacterCreationStatus; 
  onRetry?: () => void;
}) {
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});

  // 计算每个步骤的已用时间（只计算非 disabled 的步骤）
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTimes(prev => {
        const newTimes = { ...prev };
        const enabledSteps = status.steps.filter(step => step.status !== 'disabled');
        enabledSteps.forEach((step) => {
          if (step.status === 'processing') {
            newTimes[step.id] = (newTimes[step.id] || 0) + 1;
          }
        });
        return newTimes;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status.steps]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  };

  // 判断是否创建完成（进度100%且所有非 disabled 步骤完成）
  const enabledSteps = status.steps.filter(step => step.status !== 'disabled');
  const isCreationComplete = status.overallProgress >= 100 && 
    enabledSteps.every(step => step.status === 'completed');

  // 处理"跟TA聊聊"按钮点击
  const handleChatClick = () => {
    if (isCreationComplete) {
      window.location.reload();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* 整体进度卡片 */}
      <div className="bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 shadow-2xl">
        {/* 标题区域 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-white" />
              </div>
              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900 transition-all duration-300 ${isCreationComplete ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`}>
                {isCreationComplete ? <CheckCircle2 className="w-3 h-3 text-white" /> : <Sparkles className="w-3 h-3 text-white" />}
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {isCreationComplete ? '角色创建完成！' : '正在创建角色'}
              </h2>
              <p className="text-sm text-slate-400">
                {isCreationComplete ? '你的专属角色已就绪' : 'AI正在根据参考图片生成角色...'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold transition-colors duration-300 ${isCreationComplete ? 'text-green-400' : 'text-white'}`}>
              {Math.round(status.overallProgress)}%
            </div>
            <div className="text-xs text-slate-500">总进度</div>
          </div>
        </div>

        {/* "跟TA聊聊"按钮 - 创建完成后显示 */}
        <div className="mt-6">
          <Button
            onClick={handleChatClick}
            disabled={!isCreationComplete}
            className={`
              w-full text-lg py-6 rounded-xl shadow-lg transition-all duration-300
              ${isCreationComplete 
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-green-500/30 hover:scale-105 cursor-pointer' 
                : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
              }
            `}
          >
            <MessageSquare className="w-5 h-5 mr-2" />
            {isCreationComplete ? '跟TA聊聊' : '创建中...'}
            {!isCreationComplete && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          </Button>

          {/* 提示文字 */}
          <p className="text-center text-xs text-slate-500 mt-3">
            {isCreationComplete 
              ? '角色创建完成！点击按钮开始对话' 
              : `预计总耗时约 3 分 30 秒，请耐心等待... (${Math.round(status.overallProgress)}%)`
            }
          </p>
        </div>

        {/* 整体进度条 */}
        <div className="mb-6">
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ease-out rounded-full relative ${isCreationComplete ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500'}`}
              style={{ width: `${status.overallProgress}%` }}
            >
              {!isCreationComplete && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
            </div>
          </div>
        </div>

        {/* 步骤列表 - 过滤掉 disabled 的步骤 */}
        <div className="space-y-3">
          {status.steps.filter(step => step.status !== 'disabled').map((step, index) => {
            const Icon = step.icon;
            const isActive = step.status === 'processing';
            const isCompleted = step.status === 'completed';
            const isFailed = step.status === 'failed';
            const isPending = step.status === 'pending';
            const elapsed = elapsedTimes[step.id] || 0;

            return (
              <div 
                key={step.id}
                className={`
                  relative flex items-center gap-4 p-4 rounded-xl transition-all duration-300
                  ${isActive ? 'bg-blue-500/10 border border-blue-500/30' : ''}
                  ${isCompleted ? 'bg-green-500/5 border border-green-500/20' : ''}
                  ${isFailed ? 'bg-red-500/10 border border-red-500/30' : ''}
                  ${isPending ? 'bg-slate-800/50 border border-slate-700/50' : ''}
                `}
              >
                {/* 步骤图标 */}
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300
                  ${isActive ? 'bg-blue-500 text-white animate-pulse' : ''}
                  ${isCompleted ? 'bg-green-500 text-white' : ''}
                  ${isFailed ? 'bg-red-500 text-white' : ''}
                  ${isPending ? 'bg-slate-700 text-slate-500' : ''}
                `}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isFailed ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                {/* 步骤信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`
                      font-medium transition-colors
                      ${isActive ? 'text-white' : ''}
                      ${isCompleted ? 'text-green-400' : ''}
                      ${isFailed ? 'text-red-400' : ''}
                      ${isPending ? 'text-slate-500' : ''}
                    `}>
                      {step.name}
                    </h3>
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full
                      ${isActive ? 'bg-blue-500/20 text-blue-400' : ''}
                      ${isCompleted ? 'bg-green-500/20 text-green-400' : ''}
                      ${isFailed ? 'bg-red-500/20 text-red-400' : ''}
                      ${isPending ? 'bg-slate-700 text-slate-500' : ''}
                    `}>
                      {isActive && '进行中'}
                      {isCompleted && '已完成'}
                      {isFailed && '失败'}
                      {isPending && '等待中'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 truncate">{step.description}</p>

                  {/* 步骤进度条 */}
                  {isActive && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                          style={{ width: `${step.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-slate-500">{step.progress}%</span>
                        <span className="text-xs text-slate-500">
                          已用 {formatTime(elapsed)} / 预计 {step.estimatedTime}s
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 连接线和状态指示 */}
                {index < status.steps.filter(s => s.status !== 'disabled').length - 1 && (
                  <div className={`
                    absolute left-9 top-full w-0.5 h-3 -translate-y-1/2
                    ${isCompleted ? 'bg-green-500/50' : 'bg-slate-700'}
                  `} />
                )}
              </div>
            );
          })}
        </div>

        {/* 状态消息 */}
        {status.message && !isCreationComplete && (
          <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
            <p className="text-sm text-slate-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              {status.message}
            </p>
          </div>
        )}

        {/* 成功提示 */}
        {isCreationComplete && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-sm text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              角色创建成功！点击下方按钮开始对话
            </p>
          </div>
        )}

        {/* 错误提示 */}
        {status.error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {status.error}
            </p>
            {onRetry && (
              <Button 
                onClick={onRetry}
                variant="outline" 
                size="sm"
                className="mt-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重试
              </Button>
            )}
          </div>
        )}


      </div>
    </div>
  );
}

function App() {
  // 状态管理
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [background, setBackground] = useState<BackgroundConfig>({
    type: 'image',
    url: '',
  });

  const [character, setCharacter] = useState<CharacterConfig>({
    id: '',
    name: '',
    avatar: '',
    standImage: ''
  });

  const [characterDetail, setCharacterDetail] = useState<CharacterDetail>({
    id: '',
    feed_id: '',
    name: '',
    avatar: '',
    description: '',
    personality: '',
    first_mes: '',
    creator: '',
    source: 'default',
    voice_model_id: '',
  });

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacterDetail, setShowCharacterDetail] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [charId, setCharId] = useState<string>('');
  const [feedId, setFeedId] = useState<string>('');
  const [source, setSource] = useState<string>('default');
  const [charName, setCharName] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingPersonality, setIsEditingPersonality] = useState(false);
  const [isEditingFirstMes, setIsEditingFirstMes] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editPersonality, setEditPersonality] = useState('');
  const [editFirstMes, setEditFirstMes] = useState('');
  const [standImageLowered, setStandImageLowered] = useState(false);

  // 添加消息框展开状态
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);
  // 添加输入框居中状态
  const [isMessageInputCentered, setIsMessageInputCentered] = useState(false);

  // 添加语音相关状态
  const [voiceList, setVoiceList] = useState<VoiceItem[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('');

  // 添加角色搜索状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{char_id: string; name: string; avatar: string; description: string}>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(1);

  // 添加上传进度状态
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({});
  const [isUploading, setIsUploading] = useState(false);

  // 图片预览状态
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null);

  // 添加视频预览状态
  const [isMuted, setIsMuted] = useState(false);

  // 立绘视频播放相关状态
  const [tempVideoUrl, setTempVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 聊天区域滚动容器引用
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // 切换角色提示状态
  const [showSwitchHint, setShowSwitchHint] = useState(false);
  //const [isNearBottom, setIsNearBottom] = useState(false);

  // 添加视频播放相关状态
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  // 视频生成进度状态
  const [videoProgress, setVideoProgress] = useState<{
    messageId: string | null;
    msg_id: string;
    progress: number;
    char_illu_url: string;
    failed: boolean;
    error: string | null;
    isGenerating: boolean;
  }>({
    messageId: null,
    msg_id: '',
    progress: 0,
    char_illu_url: '',
    failed: false,
    error: null,
    isGenerating: false
  });

  // 角色创建状态
  const [creationStatus, setCreationStatus] = useState<CharacterCreationStatus>({
    isCreating: false,
    steps: CREATION_STEPS.map(step => ({ ...step, status: 'pending', progress: 0 })),
    currentStepIndex: 0,
    overallProgress: 0,
    message: '',
    error: null,
    charId: '',
  });

  // 创建进度轮询定时器
  const creationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 初始化会话
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const charId = urlParams.get('char_id') || 'default2';
    const source = urlParams.get('source') || 'default';
    const feedId = urlParams.get('feed_id') || '0';
    setCharId(charId);
    setSource(source);
    setFeedId(feedId);

    //查询登录用户的session_id，若有则使用否则生成新的session_id
    const localSessionId = localStorage.getItem('session_id');
    if (localSessionId) {
      setSessionId(localSessionId);
      console.log('使用本地session_id:', localSessionId);
      loadInitialChat(charId, localSessionId, source, feedId);
    } else {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      localStorage.setItem('session_id', newSessionId);
      loadInitialChat(charId, newSessionId, source, feedId);
    }

    // 清理定时器
    return () => {
      if (creationPollRef.current) {
        clearInterval(creationPollRef.current);
      }
    };
  }, []);

  // 解析后端返回的进度消息
  const parseProgressMessage = useCallback((message: string): Partial<CharacterCreationStatus> => {
    const updates: Partial<CharacterCreationStatus> = {};

    // 检查是否包含各个步骤的状态
    const stepMappings: Record<string, { index: number; keywords: string[] }> = {
      'design_report': { index: 0, keywords: ['角色设计报告'] },
      'character_card': { index: 1, keywords: ['角色描述'] },
      'character_illu': { index: 2, keywords: ['角色立绘'] },
      'background': { index: 3, keywords: ['角色宇宙'] },
      'video': { index: 4, keywords: ['视频生成'] },
      'character_image': { index: 5, keywords: ['角色设定图'] }
    };

    const newSteps = [...creationStatus.steps];
    let hasUpdates = false;

    // 解析每个步骤的状态
    Object.entries(stepMappings).forEach(([_stepId, config]) => {
      const keywordMatched = config.keywords.some(keyword => message.includes(keyword));
      
      if (keywordMatched) {
        // 检查状态
        config.keywords.forEach(keyword => {
          if (message.includes(keyword + '【完成】') || message.includes(keyword + '已完成') || message.includes(keyword + '【取消】')) {
            if (newSteps[config.index].status !== 'completed') {
              newSteps[config.index].status = 'completed';
              newSteps[config.index].progress = 100;
              hasUpdates = true;
            }
          } else if (message.includes(keyword + '生成中') || message.includes(keyword + '处理中')) {
            if (newSteps[config.index].status !== 'processing') {
              newSteps[config.index].status = 'processing';
              newSteps[config.index].progress = 50;
              hasUpdates = true;
            }
          } else if (message.includes(keyword + '失败') || message.includes(keyword + '错误')) {
            if (newSteps[config.index].status !== 'failed') {
              newSteps[config.index].status = 'failed';
              hasUpdates = true;
            }
          } else if (message.includes(keyword + '等待')) {
            if (newSteps[config.index].status !== 'pending') {
              newSteps[config.index].status = 'pending';
              hasUpdates = true;
            }
          }
        });
      } else {
        // 如果消息中不包含该步骤的任何关键词，设置为 disabled
        if (newSteps[config.index].status !== 'disabled' && 
            newSteps[config.index].status !== 'completed' && 
            newSteps[config.index].status !== 'failed') {
          newSteps[config.index].status = 'disabled';
          hasUpdates = true;
        }
      }
    });

    if (hasUpdates) {
      updates.steps = newSteps;

      // 计算当前步骤索引（只考虑非 disabled 的步骤）
      const currentIndex = newSteps.findIndex(s => s.status === 'processing');
      if (currentIndex !== -1) {
        updates.currentStepIndex = currentIndex;
      }

      // 计算整体进度（排除 disabled 的步骤）
      const enabledSteps = newSteps.filter(s => s.status !== 'disabled');
      const completedSteps = enabledSteps.filter(s => s.status === 'completed').length;
      const processingStep = enabledSteps.find(s => s.status === 'processing');
      const processingProgress = processingStep ? processingStep.progress / 100 : 0;
      updates.overallProgress = enabledSteps.length > 0 
        ? ((completedSteps + processingProgress) / enabledSteps.length) * 100 
        : 0;
    }

    // 检查是否完成
    if (message.includes('创建完成') || message.includes('角色已就绪')) {
      updates.isCreating = false;
    }

    // 检查错误
    if (message.includes('错误') || message.includes('失败')) {
      updates.error = message;
    }

    updates.message = message;
    return updates;
  }, [creationStatus.steps]);

  // 开始轮询角色创建进度
  const startCreationPolling = useCallback((charId: string, sessionId: string, source: string) => {
    // 清除之前的定时器
    if (creationPollRef.current) {
      clearInterval(creationPollRef.current);
    }

    // 重置创建状态
    setCreationStatus(prev => ({
      ...prev,
      isCreating: true,
      steps: CREATION_STEPS.map(step => ({ ...step, status: 'pending', progress: 0 })),
      currentStepIndex: 0,
      overallProgress: 0,
      message: '开始创建角色...',
      error: null,
      charId,
    }));

    // 设置第一个步骤为处理中
    setCreationStatus(prev => ({
      ...prev,
      steps: prev.steps.map((step, index) => 
        index === 0 ? { ...step, status: 'processing', progress: 10 } : step
      ),
    }));

    // 开始轮询
    creationPollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/character_chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '',
            session_id: sessionId,
            model: 'gemini-2.5-flash',
            char_id: charId,
            preset: 'default',
            lorebook: 'default',
            source: source,
            feed_id: feedId,
          }),
        });

        if (!response.ok) {
          throw new Error(`API 请求失败: ${response.status}`);
        }

        const data: ApiResponse = await response.json();

        // 解析进度消息
        const progressUpdates = parseProgressMessage(data.message);

        // 更新创建状态
        setCreationStatus(prev => ({
          ...prev,
          ...progressUpdates,
        }));

        //更新charId
        setCharId(data.char_id);

        // 如果角色创建完成，停止轮询并加载角色
        if (data.char_illu_url && data.char_name) {
          // 停止轮询
          if (creationPollRef.current) {
            clearInterval(creationPollRef.current);
            creationPollRef.current = null;
          }

          // 更新角色信息
          setBackground({ type: 'image', url: data.background_url });
          setCharName(data.char_name || '猫娘');

          setCharacter({
            id: data.char_id,
            name: data.char_name || '猫娘创作助手',
            avatar: data.char_avatar_url,
            standImage: data.char_illu_url
          });

          setCharacterDetail({
            id: data.char_id,
            feed_id: data.feed_id,
            name: data.char_name || '猫娘创作助手',
            avatar: data.char_avatar_url,
            description: data.description,
            personality: data.personality,
            first_mes: data.first_mes,
            creator: data.creator,
            source: data.source,  
            voice_model_id: data.voice_model_id,
          });

          // 添加助手消息
          if (data.message) {
            const assistantMessage: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: data.message,
              voice_message_url: data.voice_message_url,
              video_url: data.video_url,
              timestamp: new Date(),
              char_id: charId,
              background_url: data.background_url,
              char_illu_url: data.char_illu_url,
              char_name: data.char_name,
              char_avatar_url: data.char_avatar_url,
            };
            setMessages([assistantMessage]);
          }

          // 标记创建完成
          setCreationStatus(prev => ({
            ...prev,
            overallProgress: 100,
            steps: prev.steps.map(step => ({ ...step, status: 'completed', progress: 100 })),
          }));

          setIsLoading(false);
        }
      } catch (err) {
        console.error('轮询角色创建进度失败:', err);
        setCreationStatus(prev => ({
          ...prev,
          error: '获取进度失败，请刷新页面重试',
        }));
      }
    }, 4000); // 每4秒轮询一次
  }, [parseProgressMessage]);

  // 定时轮询视频生成进度 
  useEffect(() => {
    let intervalId: number | null = null;

    if (videoProgress.isGenerating && videoProgress.messageId && !videoProgress.failed) {
      intervalId = setInterval(async () => {
        try {
          const videoStatus = await fetchCharacterVideoUrl(charId, sessionId);

          setVideoProgress(prev => ({
            ...prev,
            progress: videoStatus.progress,
            failed: videoStatus.failed,
            error: videoStatus.error,
            msg_id: videoStatus.msg_id || '',
            // 生成完成或失败时，停止生成状态
            isGenerating: !(videoStatus.progress >= 100 || videoStatus.failed)
          }));

          // 如果生成完成，自动开始播放
          if (videoStatus.progress >= 100 && videoStatus.videoUrl) {
            setTempVideoUrl(videoStatus.videoUrl);
            setIsMessageExpanded(false);
            setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(e => {
                  console.error('自动播放失败:', e);
                });
              }
            }, 100);

            if (intervalId) {
              clearInterval(intervalId);
            }
          }

          // 如果失败，停止轮询
          if (videoStatus.failed) {
            if (intervalId) {
              clearInterval(intervalId);
            }
          }
        } catch (err) {
          console.error('轮询视频进度失败:', err);
        }
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [videoProgress.isGenerating, videoProgress.messageId, videoProgress.failed, charId, sessionId, videoProgress.msg_id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 添加获取语音列表的函数
  const loadVoiceList = async () => {
    setIsLoadingVoices(true);
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/char_voice_list`,
        { method: 'GET' },
        API_TIMEOUT
      );
      if (!response.ok) throw new Error(`获取语音列表失败: ${response.status}`);
      const data = await response.json();
      if (data.items && Array.isArray(data.items)) {
        setVoiceList(data.items);
      }
    } catch (err) {
      console.error('加载语音列表失败:', err);
      setVoiceList([]);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  // 角色搜索函数
  const searchCharacters = async (keyword: string, page: number = 1) => {
    if (!keyword.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/character_list?page=${page}&page_size=6&query=chars&keywords=${encodeURIComponent(keyword)}`,
        { method: 'GET' },
        API_TIMEOUT
      );
      if (!response.ok) throw new Error(`搜索角色失败: ${response.status}`);
      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        setSearchResults(data.data.map((item: any) => ({
          char_id: item.char_id,
          name: item.name || item.text || '未命名',
          avatar: item.img_src || item.avatar || '',
          description: item.description || ''
        })));
        setSearchPage(page);
        setSearchTotalPages(data.total_pages || 1);
      }
    } catch (err) {
      console.error('搜索角色失败:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // 切换到搜索的角色
  const switchToCharacter = (charId: string) => {
    //console.log('switchToCharacter called with charId:', charId);
    if (charId) {
      const url = new URL(window.location.href);
      url.searchParams.set('switch_to_char_id', charId);
      //console.log('Navigating to:', url.toString());
      window.location.href = url.toString();
    } else {
      console.log('switchToCharacter: charId is empty');
    }
  };

  // 切换函数
  const toggleStandImagePosition = () => {
    setStandImageLowered((prev) => !prev);
  };

  // 判断是否为视频URL
  const isVideoUrl = (url: string): boolean => {
    if (!url) return false;
    return url.match(/\.(mp4|webm|ogg)$/i) !== null;
  };

  // 修改获取角色视频URL的函数，同时获取进度信息
  const fetchCharacterVideoUrl = async (charId: string, sessionId: string): Promise<VideoGenerationStatus> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/get_char_video_url?char_id=${charId}&session_id=${sessionId}`,
        { method: 'GET' },
        API_TIMEOUT
      );
      if (!response.ok) throw new Error(`获取视频URL失败: ${response.status}`);
      const data = await response.json();

      return {
        videoUrl: data.video_url || null,
        progress: data.progress || 0,
        failed: data.failed === 1 || data.failed === true,
        error: data.error || null,
        msg_id: data.msg_id || '',
        char_illu_url: data.char_illu_url || null,
      };
    } catch (err) {
      console.error('获取角色视频URL失败:', err);
      return {
        videoUrl: null,
        progress: 0,
        failed: true,
        error: err instanceof Error ? err.message : '获取视频失败',
        msg_id: '',
        char_illu_url: '',
      };
    }
  };

  // 添加取消视频生成的函数
  const cancelVideoGeneration = async (charId: string, sessionId: string, msg_id: string): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/cancel_char_video_gen?char_id=${charId}&session_id=${sessionId}&msg_id=${msg_id}`,
        { method: 'GET' },
        API_TIMEOUT
      );
      if (!response.ok) {
        console.error('取消视频生成失败:', response.status);
        return false;
      }
      const data = await response.json();
      console.log('取消视频生成成功:', data);
      return true;
    } catch (err) {
      console.error('取消视频生成请求失败:', err);
      return false;
    }
  };

  // 修改 handlePlayVideo 函数，在停止时调用取消接口
  const handlePlayVideo = async (message: Message) => { 
    // 如果当前已经在播放这个消息，或者正在生成中，则停止/取消
    if (playingMessageId === message.id || videoProgress.messageId === message.id) {
      // 如果正在生成中，先调用取消接口
      if (videoProgress.isGenerating && !videoProgress.failed) {
        await cancelVideoGeneration(message.char_id, sessionId, videoProgress.msg_id);
      }

      // 停止视频播放
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }

      // 清除所有状态
      setPlayingMessageId(null);
      setTempVideoUrl(null);
      setVideoProgress({
        messageId: null,
        msg_id: '',
        char_illu_url: '',
        progress: 0,
        failed: false,
        error: null,
        isGenerating: false
      });

      return;
    }

    // 设置正在播放的消息ID
    setPlayingMessageId(message.id);

    // 初始化进度状态
    setVideoProgress({
      messageId: message.id,
      progress: 0,
      failed: false,
      error: null,
      msg_id: '',
      char_illu_url: '',
      isGenerating: true
    });

    try {
      // 获取视频状态
      const videoStatus = await fetchCharacterVideoUrl(charId, sessionId);

      // 更新进度状态
      setVideoProgress({
        messageId: message.id,
        progress: videoStatus.progress,
        failed: videoStatus.failed,
        error: videoStatus.error,
        msg_id: videoStatus.msg_id || '',
        char_illu_url: videoStatus.char_illu_url || '',
        isGenerating: !(videoStatus.progress >= 100 || videoStatus.failed)
      });

      // 如果生成失败
      if (videoStatus.failed) {
        console.error('视频生成失败:', videoStatus.error);
        setTimeout(() => {
          setPlayingMessageId(null);
        }, 1500);
        return;
      }

      const hasVideo = videoStatus.videoUrl && isVideoUrl(videoStatus.videoUrl);

      if (hasVideo && videoStatus.progress >= 100) {
        // 视频已生成完成，直接播放
        setTempVideoUrl(videoStatus.videoUrl);
        setIsMuted(false);
        setIsMessageExpanded(false);
        setVideoProgress(prev => ({ ...prev, isGenerating: false }));

        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(e => {
              console.error('视频播放失败:', e);
              setPlayingMessageId(null);
              setTempVideoUrl(null);
            });
          }
        }, 100);
      } else if (hasVideo && videoStatus.progress < 100) {
        // 视频正在生成中，保持进度显示，等待轮询更新
        // isGenerating 保持 true
      } else {
        // 没有视频URL，可能需要重新触发生成
        // 保持 isGenerating: true，让后端开始生成
      }
    } catch (err) {
      console.error('播放失败:', err);
      setPlayingMessageId(null);
      setTempVideoUrl(null);
      setVideoProgress({
        messageId: message.id,
        progress: 0,
        failed: true,
        error: err instanceof Error ? err.message : '获取视频失败',
        msg_id: '',
        char_illu_url: '',
        isGenerating: false
      });
    }
  };

  // 组件卸载时清理视频
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current = null;
      }
    };
  }, []);

  const loadInitialChat = async (charId: string, sessionId: string, source: string, feedId: string) => {
    setIsLoading(true);
    setError(null);
    setCharId(charId);
    setSource(source);
    setFeedId(feedId);

    try {
      const response = await fetch(`${API_BASE_URL}/character_chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '',
          session_id: sessionId,
          model: 'gemini-2.5-flash',
          char_id: charId,
          feed_id: feedId,
          preset: 'default',
          lorebook: 'default',
          source: source,
        }),
      });

      if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);

      const data: ApiResponse = await response.json();

      // 检查是否是角色创建中的状态
      const isProcessing = data.processing === 1;

      if (isProcessing) {
        // 角色正在创建中，启动进度轮询
        startCreationPolling(charId, sessionId, source);
        return;
      }

      setCharId(data.char_id);

      if (data.background_url) {
        setBackground({ type: 'image', url: data.background_url });
      }
      setCharName(data.char_name || '猫娘');

      if (data.char_illu_url) {
        setCharacter({
          id: data.char_id,
          name: data.char_name || '猫娘创作助手',
          avatar: data.char_avatar_url,
          standImage: data.char_illu_url
        });

        setCharacterDetail({
          id: data.char_id,
          feed_id: data.feed_id,
          name: data.char_name || '猫娘创作助手',
          avatar: data.char_avatar_url,
          description: data.description,
          personality: data.personality,
          first_mes: data.first_mes,
          creator: data.creator,
          source: data.source,  
          voice_model_id: data.voice_model_id,
        });

        if (data.video_url && isVideoUrl(data.video_url)) {
          // 有视频URL，先显示视频
          setTempVideoUrl(data.video_url);
          setIsMuted(false); // 先静音播放，确保能自动播放
          setIsMessageExpanded(false);
  
          // 尝试取消静音（如果浏览器允许）
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              videoRef.current.play().catch(() => {
                // 如果取消静音播放失败，保持静音
                console.log('无法自动播放声音，保持静音');
              });
            }
          }, 100);
          // 视频播放结束后会自动触发 onEnded 事件恢复立绘
          // 这里不需要额外设置，video 元素的 onEnded 回调会处理
        }
      }

      if (data.message) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.message,
          voice_message_url: data.voice_message_url,
          video_url: data.video_url,
          timestamp: new Date(),
          char_id: charId,
          background_url: data.background_url,
          char_illu_url: data.char_illu_url,
          char_name: data.char_name,
          char_avatar_url: data.char_avatar_url,
        };
        setMessages([assistantMessage]);
      }
    } catch (err) {
      console.error('初始化失败:', err);
      setError('初始化失败，请刷新页面重试');
      setBackground({ 
        type: 'image', 
        url: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1920&q=80' 
      });
      setCharacter({
        id: '',
        name: '猫娘创作助手',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=assistant',
        standImage: ''
      });
      setMessages([{
        id: '1',
        role: 'assistant',
        content: 'CuddlyCuddle: Chat with Anyone You See!',
        voice_message_url: '',
        video_url: '',
        timestamp: new Date(),
        char_id: charId,
        background_url: '',
        char_illu_url: '',
        char_name: charName,
        char_avatar_url: '',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const API_TIMEOUT = 60000;

  const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number = API_TIMEOUT): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接');
      }
      throw error;
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return;
    
    // 发送消息后关闭居中模式
    if (isMessageInputCentered) {
      setIsMessageInputCentered(false);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      voice_message_url: '',
      video_url: '',
      timestamp: new Date(),
      char_id: charId,
      background_url: background.url,
      char_illu_url: character.standImage,
      char_name: character.name,
      char_avatar_url: character.avatar,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/character_chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: sessionId,
          model: 'gemini-2.5-flash',
          char_id: charId,
          feed_id: feedId,
          preset: 'default',
          lorebook: 'default',
        }),
      }, API_TIMEOUT);

      if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);

      const data: ApiResponse = await response.json();

      if (data.background_url) {
        setBackground({ type: 'image', url: data.background_url });
      }
      if (data.char_illu_url) {
        setCharacter({
          id: data.char_id,
          name: data.char_name,
          avatar: data.char_avatar_url,
          standImage: data.char_illu_url,
        });
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        voice_message_url: data.voice_message_url,
        video_url: data.video_url,
        timestamp: new Date(),
        char_id: charId,
        background_url: data.background_url,
        char_illu_url: data.char_illu_url,
        char_name: data.char_name,
        char_avatar_url: data.char_avatar_url,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('发送消息失败:', err);
      setError('发送失败，请重试');
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，我遇到了一些问题，请稍后再试。',
        voice_message_url: '',
        video_url: '',
        timestamp: new Date(),
        char_id: charId,
        background_url: '',
        char_illu_url: '',
        char_name: charName,
        char_avatar_url: '',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  // 上传图片到后端
  const uploadImageToServer = async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('char_id', characterDetail.id);
    formData.append('type', 'image');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded * 100) / event.total);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response.url || response.data?.url || '');
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        } else {
          reject(new Error(`上传失败: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('网络请求失败'));
      });

      xhr.open('POST', `${API_IMAGE_URL}/upload_file`);
      xhr.send(formData);
    });
  };

  // 上传视频到后端
  const uploadVideoToServer = async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('char_id', characterDetail.id);
    formData.append('type', 'video');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded * 100) / event.total);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response.url || response.data?.url || '');
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        } else {
          reject(new Error(`上传失败: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('网络请求失败'));
      });

      xhr.open('POST', `${API_IMAGE_URL}/upload_file`);
      xhr.send(formData);
    });
  };

  // 修改后的文件上传处理函数，支持上传到后端
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    const uploadedItems: GalleryImage[] = [];
    const uploadPromises: Promise<void>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileType = file.type;
      const fileId = `${Date.now()}_${i}`;

      // 检查是否为允许的文件类型
      const isImage = fileType.startsWith('image/');
      const isVideo = fileType.startsWith('video/') && 
        (fileType === 'video/mp4' || fileType === 'video/webm' || fileType === 'video/ogg');

      if (!isImage && !isVideo) {
        console.warn(`不支持的文件类型: ${fileType}`);
        continue;
      }

      // 创建上传任务
      const uploadPromise = async () => {
        try {
          setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));

          let url: string;

          if (isImage) {
            url = await uploadImageToServer(file, (progress) => {
              setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
            });
          } else {
            url = await uploadVideoToServer(file, (progress) => {
              setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
            });
          }

          uploadedItems.push({
            url: url,
            description: isVideo ? '新上传的视频' : '新上传的图片',
            type: isVideo ? 'video' : 'image'
          });
        } catch (err) {
          console.error(`上传文件失败: ${file.name}`, err);
          setError(`上传 ${file.name} 失败`);
        } finally {
          setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
          });
        }
      };

      uploadPromises.push(uploadPromise());
    }

    // 等待所有上传完成
    await Promise.all(uploadPromises);

    if (uploadedItems.length > 0) {
      setGalleryImages((prev) => [...prev, ...uploadedItems]);
    }

    setIsUploading(false);

    // 清空input，允许重复选择相同文件
    event.target.value = '';
  };

  const handleSaveCharAvatarUrl = async (url: string) => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/update_character`,
      { method: 'POST', body: JSON.stringify({ char_id: characterDetail.id, field: 'char_avatar_url', value: url }) },
      API_TIMEOUT
    );
    if (!response.ok) throw new Error(`更新角色头像失败: ${response.status}`);
    const data = response.json();
    console.log('更新角色头像成功', data);
    setCharacterDetail((prev) => ({ ...prev, char_avatar_url: url }));
  };

  const handleSaveFirstMes = async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/update_character`,
      { method: 'POST', body: JSON.stringify({ char_id: characterDetail.id, field: 'first_mes', value: editFirstMes }) },
      API_TIMEOUT
    );
    if (!response.ok) throw new Error(`更新角色开场白失败: ${response.status}`);
    const data = response.json();
    console.log('更新角色开场白成功', data);
    setCharacterDetail((prev) => ({ ...prev, first_mes: editFirstMes }));
    setIsEditingFirstMes(false);
  };

  const handleSaveDescription = async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/update_character`,
      { method: 'POST', body: JSON.stringify({ char_id: characterDetail.id, field: 'description', value: editDescription }) },
      API_TIMEOUT
    );
    if (!response.ok) throw new Error(`更新角色描述失败: ${response.status}`);
    const data = response.json();
    console.log('更新角色描述成功', data);
    setCharacterDetail((prev) => ({ ...prev, description: editDescription }));
    setIsEditing(false);
  };

  const handleSavePersonality = async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/update_character`,
      { method: 'POST', body: JSON.stringify({ char_id: characterDetail.id, field: 'personality', value: editPersonality }) },
      API_TIMEOUT
    );
    if (!response.ok) throw new Error(`更新角色个性失败: ${response.status}`);
    const data = response.json();
    console.log('更新角色个性成功', data);
    setCharacterDetail((prev) => ({ ...prev, personality: editPersonality }));
    setIsEditingPersonality(false);
  };

  const openCharacterDetail = () => {
    setEditDescription(characterDetail.description);
    setEditPersonality(characterDetail.personality);
    setEditFirstMes(characterDetail.first_mes);
    setShowCharacterDetail(true);
    loadGallery(characterDetail.id);
    loadVoiceList();
    if (characterDetail.voice_model_id) {
      setSelectedVoice(characterDetail.voice_model_id);
    }
  };

  // 处理语音选择变化
  const handleVoiceChange = async(value: string) => {
    setSelectedVoice(value);
    console.log('handleVoiceChange', value);
    //TODO: 更新角色语音模型
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/set_char_voice`,
      { method: 'POST', body: JSON.stringify({ char_id: characterDetail.id, voice_model_id: value }) },
      API_TIMEOUT
    );
    if (!response.ok) throw new Error(`更新角色语音模型失败: ${response.status}`);
    const data = response.json();
    console.log('更新角色语音模型成功', data);
    setCharacterDetail((prev) => ({ ...prev, voice_model_id: value }));
  };

  // 图片预览功能
  const openPreview = (index: number) => {
    setPreviewIndex(index);
    setPreviewImage(galleryImages[index]);
    setPreviewOpen(true);

    setIsMuted(isVideoUrl(galleryImages[index].url) ? false : true);

    // 自动关闭角色详情弹窗
    setShowCharacterDetail(false);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewImage(null);

    // 重新打开角色详情弹窗，返回到图库标签页
    setShowCharacterDetail(true);
  };

  const prevImage = () => {
    if (galleryImages.length <= 1) return;
    const newIndex = previewIndex === 0 ? galleryImages.length - 1 : previewIndex - 1;
    setPreviewIndex(newIndex);
    setPreviewImage(galleryImages[newIndex]);
  };

  const nextImage = () => {
    if (galleryImages.length <= 1) return;
    const newIndex = previewIndex === galleryImages.length - 1 ? 0 : previewIndex + 1;
    setPreviewIndex(newIndex);
    setPreviewImage(galleryImages[newIndex]);
  };

  const downloadImage = async () => {
    if (!previewImage) return;
    try {
      const response = await fetch(previewImage.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = previewImage.url.split('/').pop() || `image_${previewIndex + 1}.jpg`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('下载图片失败:', err);
      window.open(previewImage.url, '_blank');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!previewOpen) return;
      switch (e.key) {
        case 'Escape': closePreview(); break;
        case 'ArrowLeft': prevImage(); break;
        case 'ArrowRight': nextImage(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen, previewIndex, galleryImages]);

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');

  const loadGallery = async (charId: string) => {
    if (!charId) return;
    setIsLoadingGallery(true);
    try {
      const response = await fetchWithTimeout(
        `${API_IMAGE_URL}/get_gallery?char_id=${charId}&session_id=${sessionId}`,
        { method: 'GET' },
        API_TIMEOUT
      );
      if (!response.ok) throw new Error(`获取素材失败: ${response.status}`);
      const data = await response.json();
      if (data.images && Array.isArray(data.images)) {
        // 自动检测每个项目的类型
        const processedImages = data.images.map((item: GalleryImage) => ({
          ...item,
          type: isVideoUrl(item.url) ? 'video' : 'image'
        }));
        setGalleryImages(processedImages);
      }
    } catch (err) {
      console.error('加载素材库失败:', err);
      setGalleryImages([]);
    } finally {
      setIsLoadingGallery(false);
    }
  };

  // 删除图片函数 - 同步后端删除
  const handleDeleteImage = async (index: number, url: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // 确认删除
    if (!confirm('确定要删除这张图片吗？')) {
      return;
    }

    try {
      // 调用后端 API 删除
      const response = await fetchWithTimeout(
        `${API_IMAGE_URL}/remove_gallery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url }),
        },
        API_TIMEOUT
      );

      if (!response.ok) {
        throw new Error(`删除失败: ${response.status}`);
      }

      // 后端删除成功后，更新前端状态
      setGalleryImages((prev) => prev.filter((_, i) => i !== index));

      console.log('图片删除成功:', url);
    } catch (err) {
      console.error('删除图片失败:', err);
      setError('删除图片失败，请重试');
      // 可以在这里添加 toast 提示
    }
  };

  // 获取当前应该显示的立绘URL（临时视频或原始立绘）
  const getCurrentStandImage = (): string => {
    if (tempVideoUrl) return tempVideoUrl;
    return character.standImage;
  };

  // 判断当前立绘是否为视频
  const isCurrentStandVideo = (): boolean => {
    const url = getCurrentStandImage();
    return isVideoUrl(url);
  };

  // 重试角色创建
  const handleRetryCreation = () => {
    setCreationStatus(prev => ({
      ...prev,
      error: null,
      steps: CREATION_STEPS.map(step => ({ ...step, status: 'pending', progress: 0 })),
    }));
    startCreationPolling(charId, sessionId, source);
  };

  // ========== 下滑切换角色功能 ==========

  // 处理切换到下一个角色
  const handleSwitchNextCharacter = useCallback(() => {
    const currentFeedId = parseInt(feedId) || 0;
    const nextFeedId = currentFeedId + 1;

    // 构建新的 URL，feed_id + 1
    const url = new URL(window.location.href);
    url.searchParams.set('feed_id', nextFeedId.toString());

    // 刷新页面
    window.location.href = url.toString();
  }, [feedId]);

  // 监听聊天区域滚动
  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // 计算是否接近底部（距离底部 100px 内视为接近底部）
    const isBottom = scrollHeight - scrollTop - clientHeight < 100;

    //setIsNearBottom(isBottom);

    // 如果接近底部，显示切换提示
    if (isBottom && !creationStatus.isCreating && messages.length > 0) {
      setShowSwitchHint(true);
    } else {
      setShowSwitchHint(false);
    }
  }, [creationStatus.isCreating, messages.length]);

  // 处理滚轮事件 - 检测是否继续下滑
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = chatContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // 检查是否已经在底部且继续向下滚动
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 10;

    if (isAtBottom && e.deltaY > 0 && !creationStatus.isCreating) {
      // 在底部继续下滑，切换到下一个角色
      handleSwitchNextCharacter();
    }
  }, [creationStatus.isCreating, handleSwitchNextCharacter]);

  // 触摸事件处理（移动端支持）
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const container = chatContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 10;
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY.current - touchY;

    // 如果在底部且向上滑动（即内容向下滚动）
    if (isAtBottom && deltaY > 50 && !creationStatus.isCreating) {
      handleSwitchNextCharacter();
    }
  }, [creationStatus.isCreating, handleSwitchNextCharacter]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* 背景层 */}
      <div className="absolute inset-0 z-0 transition-opacity duration-700">
        {background.url ? (
          isVideoUrl(background.url) ? (
            <video src={background.url} autoPlay loop muted={isMuted} playsInline style={{ '--playback-rate': 0.75 } as React.CSSProperties} className="w-full h-full object-cover">
            {/* 视频控制栏 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-md rounded-full px-4 py-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 text-white/80 hover:text-white transition-colors"
              title={isMuted ? "取消静音" : "静音"}
            >
              {isMuted ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" stroke-linejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
            <span className="text-white/60 text-xs">
              {isMuted ? '已静音' : '有声播放'}
            </span>
            </div>
            </video>
          ) : (
            <img src={background.url} alt="background" className="w-full h-full object-cover transition-transform duration-1000" />
          )
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* 角色立绘层 - 支持图片和视频 */}
      {getCurrentStandImage() && (
        <div 
        className="absolute inset-0 z-10 character-stand cursor-pointer"
        onClick={toggleStandImagePosition}
        title="点击切换立绘位置"
      >
        {isCurrentStandVideo() ? (
          // 视频立绘
          <video
            ref={videoRef}
            src={getCurrentStandImage()}
            autoPlay
            muted={false} // 立绘视频不静音
            loop={false}
            playsInline
            onEnded={() => {
              // 视频播放结束：恢复立绘
              setPlayingMessageId(null);
              setTempVideoUrl(null);
              if (videoProgress.char_illu_url) {
                setCharacter(prev => ({
                  ...prev,
                  standImage: videoProgress.char_illu_url
                }));
              }
            }}
            onError={() => {
              // 视频加载/播放错误：恢复立绘
              console.error('视频播放错误' + getCurrentStandImage());
              setPlayingMessageId(null);
              setTempVideoUrl(null);
            }}
            className="absolute left-1/2 -translate-x-1/2 w-full h-[70vh] object-cover transition-all duration-500 ease-in-out"
            style={{
              bottom: standImageLowered ? '-180px' : '-60px',
              filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.3))',
              maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)'
            }}
          />
        ) : (
          // 图片立绘
          <img
            src={getCurrentStandImage()}
            alt="character"
            className="absolute left-1/2 -translate-x-1/2 w-full h-[70vh] object-cover transition-all duration-500 ease-in-out"
            style={{ 
              bottom: standImageLowered ? '-180px' : '-60px',
              filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.3))',
              maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)'
            }}
          />
        )}
      </div>
      )}

      {/* 主内容层 */}
      <div className="relative z-20 flex flex-col h-full">
        <header className="flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-3">
            <a 
              href="/character/char.html" 
              className="flex items-center gap-3 group cursor-pointer"
              title="返回首页"
            >
              <div className="relative">
                {/* 替换为 favicon - 使用 img 标签 */}
                <img 
                  src="/character/apple-touch-icon.png" 
                  alt="CuddlyCuddle" 
                  className="w-6 h-6 object-contain group-hover:scale-110 transition-transform"
                  onError={(e) => {
                    // 如果 favicon 加载失败，显示 Sparkles 作为 fallback
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                {/* Fallback: 如果 favicon 加载失败，显示 Sparkles */}
                <Sparkles className="w-6 h-6 text-white/80 group-hover:text-white transition-colors hidden" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-semibold text-white/90 group-hover:text-white transition-colors">
                  CuddlyCuddle
                </h1>
                <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
                  上滑发现更多角色
                </span>
              </div>
            </a>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="w-5 h-5 text-white/60 animate-spin" />}
            <Dialog open={showSettings} onOpenChange={(open) => {
              setShowSettings(open);
            }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10">
                  <Settings className="w-5 h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-slate-900/95 border-slate-700 text-white max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    角色搜索
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {/* 角色搜索输入框 */}
                  <div className="space-y-2">
                    <label className="text-sm text-slate-400">搜索角色</label>
                    <div className="flex gap-2">
                      <Input
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') searchCharacters(searchKeyword); }}
                        placeholder="输入关键词搜索角色..."
                        className="flex-1 bg-slate-800 border-slate-600 text-white"
                      />
                      <Button
                        onClick={() => searchCharacters(searchKeyword)}
                        disabled={isSearching || !searchKeyword.trim()}
                        className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
                      >
                        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : '搜索'}
                      </Button>
                    </div>
                  </div>

                  {/* 搜索结果列表 */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">搜索结果</label>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {searchResults.map((char) => (
                          <div
                            key={char.char_id}
                            className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"
                            onClick={() => switchToCharacter(char.char_id)}
                          >
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={char.avatar} />
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-sm">
                                {char.name?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-white text-sm truncate">{char.name}</p>
                              {char.description && (
                                <p className="text-xs text-slate-400 truncate">{char.description}</p>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">
                              切换
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* 分页控制 */}
                      {searchTotalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => searchCharacters(searchKeyword, searchPage - 1)}
                            disabled={searchPage <= 1 || isSearching}
                            className="text-white/70 hover:text-white disabled:opacity-50"
                          >
                            上一页
                          </Button>
                          <span className="text-sm text-slate-400">
                            {searchPage} / {searchTotalPages}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => searchCharacters(searchKeyword, searchPage + 1)}
                            disabled={searchPage >= searchTotalPages || isSearching}
                            className="text-white/70 hover:text-white disabled:opacity-50"
                          >
                            下一页
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 无搜索结果提示 */}
                  {!isSearching && searchResults.length === 0 && searchKeyword && (
                    <div className="text-center py-4 text-slate-500">
                      未找到匹配的角色
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm text-slate-400">会话信息</label>
                    <div className="p-3 bg-slate-800 rounded-lg">
                      <p className="text-sm text-slate-400">会话ID</p>
                      <p className="text-xs text-slate-500 font-mono break-all">{sessionId}</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {error && <div className="px-6 py-2 bg-red-500/80 text-white text-center text-sm">{error}</div>}

        {/* 角色创建进度显示 - 使用新的 CharacterCreationProgress 组件 */}
        {creationStatus.isCreating && (
          <div className="flex-1 flex items-center justify-center px-6">
            <CharacterCreationProgress 
              status={creationStatus} 
              onRetry={handleRetryCreation}
            />
          </div>
        )}

        {/* 升降立绘位置浮动按钮 - 放在右侧 */}
        {!creationStatus.isCreating && character.standImage && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
            <button
              onClick={toggleStandImagePosition}
              className="p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white/70 hover:text-white hover:bg-black/60 transition-all duration-300 group"
              title={standImageLowered ? "上升" : "下降"}
            >
              {standImageLowered ? (
                // 上升图标（当前在下方，点击上升）
                <svg 
                  className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              ) : (
                // 下降图标（当前在上方，点击下降）
                <svg 
                  className="w-5 h-5 transition-transform group-hover:translate-y-0.5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
            </button>
            {/* 私信按钮 - 调整输入框位置到页面中间 */}
            <button
              onClick={() => setIsMessageInputCentered(prev => !prev)}
              className={`p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full transition-all duration-300 group ${isMessageInputCentered ? 'bg-blue-500/40 border-blue-500/50 text-white' : 'text-white/70 hover:text-white hover:bg-black/60'}`}
              title={isMessageInputCentered ? "恢复默认位置" : "私信"}
            >
              <svg 
                className="w-5 h-5 transition-transform group-hover:scale-110" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          </div>
        )}

        {/* 聊天内容区域 - 仅在非创建状态时显示 */}
        {!creationStatus.isCreating && (
          <div 
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            className="flex-1 flex flex-col justify-end pb-2 mb-25 overflow-y-auto scrollbar-hide"
          >
            {/* 下滑切换提示 */}
            {showSwitchHint && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 animate-bounce">
                <div className="flex flex-col items-center gap-2 px-4 py-3 bg-black/60 backdrop-blur-md rounded-full border border-white/20">
                  <ChevronDown className="w-5 h-5 text-white/80" />
                  <span className="text-xs text-white/80 whitespace-nowrap">继续下滑切换下一个角色</span>
                </div>
              </div>
            )}

          {lastAssistantMessage && (
               <div 
               className={`px-2 sm:px-4 message-bubble w-full transition-all duration-500 ease-in-out cursor-pointer ${
                 isMessageExpanded ? 'mb-10 sm:mb-16' : 'mb-8 sm:mb-12'
               }`}
               onClick={() => setIsMessageExpanded(!isMessageExpanded)}
               title="点击展开/收起消息"
             >
                  <div className="w-full max-w-none mx-0">
                      <div className="flex items-start gap-2 sm:gap-4">
                          <Avatar 
                              className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-white/20 shadow-lg cursor-pointer hover:scale-105 transition-transform shrink-0"
                              onClick={openCharacterDetail}
                          >
                              <AvatarImage src={characterDetail.avatar} />
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                  {characterDetail.name?.[0] || '?'}
                              </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 sm:mb-2 flex-wrap">
                                  <span 
                                      className="text-white/90 font-medium cursor-pointer hover:underline text-sm sm:text-base"
                                      onClick={openCharacterDetail}
                                  >
                                      {character.name}
                                  </span>
                                  <span className="text-white/40 text-xs sm:text-sm">
                                      {lastAssistantMessage.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {/* 语音播放按钮和进度显示 */}
                                  <div className="flex items-center gap-2">
                                      {/* 进度显示区域 */}
                                      {videoProgress.messageId === lastAssistantMessage.id && (
                                        <div className="flex items-center gap-2">
                                          {videoProgress.failed ? (
                                            // 生成失败显示
                                            <div className="flex items-center gap-1 px-2 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
                                              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                              <span className="text-xs text-red-400" title={videoProgress.error || '生成失败'}>
                                                生成失败
                                              </span>
                                            </div>
                                          ) : videoProgress.isGenerating ? (
                                            // 生成中显示进度条
                                            <div className="flex items-center gap-2 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full min-w-[100px]">
                                              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div 
                                                  className="h-full bg-blue-400 transition-all duration-300"
                                                  style={{ width: `${videoProgress.progress}%` }}
                                                />
                                              </div>
                                              <span className="text-xs text-blue-400 w-8 text-right">
                                                {videoProgress.progress}%
                                              </span>
                                            </div>
                                          ) : null}
                                        </div>
                                      )}

                                    {/* 播放按钮 */}
                                      <button
                                          onClick={() => handlePlayVideo(lastAssistantMessage)}
                                          className="ml-auto p-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors border-2 border-pink-500"
                                          title={playingMessageId === lastAssistantMessage.id ? '停止' : '播放'}
                                      >
                                          {playingMessageId === lastAssistantMessage.id ? (
                                              <svg className="w-5 h-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
                                                  <rect x="6" y="6" width="12" height="12" />
                                              </svg>
                                          ) : (
                                              <svg className="w-5 h-5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                                                  <path d="M8 5v14l11-7z" />
                                              </svg>
                                          )}
                                      </button>
                                  </div>

                              </div>
                              <div className={`bg-black/50 backdrop-blur-md rounded-2xl rounded-tl-sm px-3 sm:px-6 py-3 sm:py-4 border border-white/10 overflow-y-auto custom-scrollbar transition-all duration-500 ease-in-out ${
                                isMessageExpanded 
                                  ? 'max-h-[40vh] sm:max-h-[60vh]' 
                                  : 'max-h-[15vh] sm:max-h-[25vh]'
                              }`}>
      <p className="text-white/95 text-base sm:text-lg leading-relaxed whitespace-pre-wrap break-words">{lastAssistantMessage.content}</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}

            {isTyping && (
              <div className="px-6 mb-4">
                <div className="max-w-3xl mx-auto flex items-center gap-2 text-white/50">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">{character.name} 正在输入...</span>
                </div>
              </div>
            )}

            {/* 视频生成进度条 - 显示在"正在输入"区域 */}
            {videoProgress.isGenerating && videoProgress.messageId && (
              <div className="px-6 mb-4">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-blue-300 font-medium">正在生成视频...</span>
                        <span className="text-sm text-blue-400 font-mono">{videoProgress.progress}%</span>
                      </div>
                      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out rounded-full"
                          style={{ width: `${videoProgress.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 视频生成失败提示 */}
            {videoProgress.failed && videoProgress.messageId && (
              <div className="px-6 mb-4">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <span className="text-sm text-red-300">视频生成失败</span>
                      {videoProgress.error && (
                        <p className="text-xs text-red-400/70 mt-0.5">{videoProgress.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div 
              className={`px-6 mb-4 transition-all duration-500 ease-in-out ${isMessageInputCentered ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm' : ''}`}
              onClick={(e) => {
                if (isMessageInputCentered && e.target === e.currentTarget) {
                  setIsMessageInputCentered(false);
                }
              }}
            >
              <div 
                className={`max-w-3xl mx-auto transition-all duration-500 ${isMessageInputCentered ? 'w-full max-w-2xl px-6' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`relative flex items-center gap-2 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-2 ${isMessageInputCentered ? 'bg-slate-900/95 border-slate-600 shadow-2xl scale-110' : ''}`}>

                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                    placeholder={character.name ? `想看什么？在这里直接私信 ${character.name}...` : '想看什么直接说...'}
                    disabled={isTyping || isLoading}
                    className="flex-1 bg-transparent border-0 text-white placeholder:text-white/40 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isTyping || isLoading}
                    className="shrink-0 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl px-4 disabled:opacity-50"
                  >
                    {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 角色详情页面 */}
      <Dialog open={showCharacterDetail} onOpenChange={setShowCharacterDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-slate-900/98 border-slate-700 text-white overflow-hidden p-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setShowCharacterDetail(false)} className="text-white/70 hover:text-white hover:bg-white/10">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <User className="w-5 h-5" />
                角色详情
              </DialogTitle>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="w-full grid grid-cols-2 bg-slate-800/50 rounded-none">
                <TabsTrigger value="info">基本信息</TabsTrigger>
                <TabsTrigger value="gallery">图库 ({galleryImages.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="p-6 space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    {characterDetail.source ? (
                      <a 
                        href={characterDetail.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block cursor-pointer"
                        title="查看角色来源"
                      >
                        <Avatar className="w-32 h-32 border-4 border-slate-700 hover:border-blue-500 transition-colors">
                          <AvatarImage src={characterDetail.avatar} className="object-cover" />
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-4xl">
                            {characterDetail.name?.[0] || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white text-sm font-medium">查看来源</span>
                        </div>
                      </a>
                    ) : (
                      <Avatar className="w-32 h-32 border-4 border-slate-700">
                        <AvatarImage src={characterDetail.avatar} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-4xl">
                          {characterDetail.name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <p className="text-sm text-slate-400">
                    {characterDetail.source ? '点击查看角色来源' : '用户上传'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-400">角色名称</label>
                  <Input
                    value={characterDetail.name}
                    onChange={(e) => setCharacterDetail((prev) => ({ ...prev, name: e.target.value }))}
                    className="bg-slate-800 border-slate-600 text-white"
                    placeholder="输入角色名称"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-400">角色语音</label>
                  <div className="relative">
                    <select
                      value={selectedVoice}
                      onChange={(e) => handleVoiceChange(e.target.value)}
                      disabled={isLoadingVoices}
                      className="w-full h-10 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 appearance-none cursor-pointer"
                    >
                      <option value="">不设置语音</option>
                      {voiceList.map((voice) => (
                        <option key={voice.modelId} value={voice.modelId}>
                          {voice.title}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      {isLoadingVoices ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  {selectedVoice && (
                    <p className="text-xs text-slate-500">
                      {voiceList.find(v => v.modelId === selectedVoice)?.description || '已选择语音'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-400">角色描述</label>
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-white">取消</Button>
                        <Button size="sm" onClick={handleSaveDescription} className="bg-blue-500 hover:bg-blue-600">保存</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} className="text-slate-400 hover:text-white">编辑</Button>
                    )}
                  </div>
                  {isEditing ? (
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white min-h-[200px]"
                      placeholder="支持 Markdown 格式"
                    />
                  ) : (
                    <div className="bg-slate-800/50 rounded-lg p-4 min-h-[200px]">
                      {characterDetail.description ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{characterDetail.description}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">暂无描述，点击编辑添加...</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-400">开场白</label>
                    {isEditingFirstMes ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingFirstMes(false)} className="text-slate-400 hover:text-white">取消</Button>
                        <Button size="sm" onClick={handleSaveFirstMes} className="bg-blue-500 hover:bg-blue-600">保存</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingFirstMes(true)} className="text-slate-400 hover:text-white">编辑</Button>
                    )}
                  </div>
                  {isEditingFirstMes ? (
                    <Textarea
                      value={editFirstMes}
                      onChange={(e) => setEditFirstMes(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white min-h-[200px]"
                      placeholder="支持 Markdown 格式"
                    />
                  ) : (
                    <div className="bg-slate-800/50 rounded-lg p-4 min-h-[200px]">
                      {characterDetail.first_mes ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{characterDetail.first_mes}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">暂无开场白，点击编辑添加...</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-400">角色个性</label>
                    {isEditingPersonality ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingPersonality(false)} className="text-slate-400 hover:text-white">取消</Button>
                        <Button size="sm" onClick={handleSavePersonality} className="bg-blue-500 hover:bg-blue-600">保存</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingPersonality(true)} className="text-slate-400 hover:text-white">编辑</Button>
                    )}
                  </div>
                  {isEditingPersonality ? (
                    <Textarea
                      value={editPersonality}
                      onChange={(e) => setEditPersonality(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white min-h-[200px]"
                      placeholder="支持 Markdown 格式"
                    />
                  ) : (
                    <div className="bg-slate-800/50 rounded-lg p-4 min-h-[200px]">
                      {characterDetail.personality ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{characterDetail.personality}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">暂无个性，点击编辑添加...</p>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="gallery" className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">角色素材</h3>
                    <div className="flex items-center gap-2">
                      {isUploading && (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>上传中...</span>
                        </div>
                      )}
                      <Button 
                        onClick={() => imageInputRef.current?.click()} 
                        className="bg-blue-500 hover:bg-blue-600"
                        disabled={isUploading}
                      >
                        <ImagePlus className="w-4 h-4 mr-2" />
                        添加素材（图片/视频）
                      </Button>
                    </div>
                    {/* 修改后的文件输入框，支持图片和视频 */}
                    <input 
                      type="file" 
                      ref={imageInputRef} 
                      accept="image/*,video/mp4,video/webm,video/ogg" 
                      multiple 
                      onChange={handleImageUpload} 
                      className="hidden" 
                      disabled={isUploading}
                    />
                  </div>

                  {/* 上传进度显示 */}
                  {Object.keys(uploadProgress).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(uploadProgress).map(([fileId, progress]) => (
                        <div key={fileId} className="flex items-center gap-2 text-sm text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>文件上传中: {progress}%</span>
                          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {isLoadingGallery && (
                    <div className="flex items-center justify-center py-12 text-slate-500">
                      <Loader2 className="w-8 h-8 animate-spin mr-2" />
                      <p>加载素材中...</p>
                    </div>
                  )}

                  {!isLoadingGallery && galleryImages.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {galleryImages.map((item, index) => (
                        <div 
                          key={index} 
                          className="relative group rounded-lg overflow-hidden bg-slate-800 cursor-pointer"
                          onClick={() => openPreview(index)}
                        >
                          <div className="aspect-square">
                          {item.type === 'video' || isVideoUrl(item.url) ? (
                            <>
                              <video
                                src={item.url}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                              {/* 视频标识 */}
                              <div className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                              {/* 悬停时播放预览 */}
                              <video
                                src={item.url}
                                className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"
                                muted
                                autoPlay
                                loop
                                playsInline
                              />
                            </>
                          ) : (
                            <img
                              src={item.url}
                              alt={item.description || `图片 ${index + 1}`}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />
                          )}
                          </div>
                          {item.description && (
                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                              <p className="text-xs text-white/90 line-clamp-2">{item.description}</p>
                            </div>
                          )}
                          {/* 类型标签 */}
                          {(item.type === 'video' || isVideoUrl(item.url)) && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-500/80 text-xs rounded-full text-white">
                              视频
                            </div>
                          )}
                          {characterDetail.avatar === item.url && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-500 text-xs rounded-full text-white">
                              当前头像
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSaveCharAvatarUrl(item.url)}
                              className="text-white hover:bg-white/20"
                              title="设为头像"
                            >
                              <User className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); openPreview(index); }}
                              className="text-white hover:bg-white/20"
                              title={item.type === 'video' || isVideoUrl(item.url) ? "播放视频" : "查看大图"}
                            >
                              {item.type === 'video' || isVideoUrl(item.url) ? (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              ) : (
                                <ZoomIn className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => handleDeleteImage(index, item.url, e)}
                              className="text-red-400 hover:bg-red-500/20"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !isLoadingGallery ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                      <ImagePlus className="w-16 h-16 mb-4 opacity-50" />
                      <p>暂无素材，点击添加按钮上传</p>
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* 图片预览弹窗 */}
      {previewOpen && previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closePreview}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX.current - touchEndX;
            const minSwipeDistance = 50; // 最小滑动距离
            
            if (Math.abs(diff) > minSwipeDistance) {
              if (diff > 0) {
                // 左滑 - 下一张
                nextImage();
              } else {
                // 右滑 - 上一张
                prevImage();
              }
            }
          }}
        >
          <button onClick={closePreview} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-50">
            <X className="w-6 h-6" />
          </button>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {previewIndex + 1} / {galleryImages.length}
          </div>

          {galleryImages.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); prevImage(); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeftIcon className="w-8 h-8" />
            </button>
          )}

          {galleryImages.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); nextImage(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
              <ChevronRightIcon className="w-8 h-8" />
            </button>
          )}

          <div className="w-[95vw] max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* 根据类型显示图片或视频 */}
            {previewImage.type === 'video' || isVideoUrl(previewImage.url) ? (
              <div className="relative w-full max-h-[75vh]">
                <video
                  src={previewImage.url}
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                  className="w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
                  controls={false} // 隐藏默认控制条，使用自定义控制
                />
                {/* 视频控制栏 */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-md rounded-full px-4 py-2">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 text-white/80 hover:text-white transition-colors"
                    title={isMuted ? "取消静音" : "静音"}
                  >
                    {isMuted ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" stroke-linejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                  </button>
                  <span className="text-white/60 text-xs">
                    {isMuted ? '已静音' : '有声播放'}
                  </span>
                </div>
              </div>
            ) : (
              <img 
                src={previewImage.url} 
                alt={previewImage.description || '预览图片'} 
                className="w-full max-h-[75vh] object-contain rounded-lg shadow-2xl" 
              />
            )}
            {previewImage.description && <p className="mt-4 text-white/80 text-center max-w-2xl">{previewImage.description}</p>}
            <div className="mt-6 flex items-center gap-4">
              <Button onClick={downloadImage} className="bg-blue-500 hover:bg-blue-600 text-white">
                <Download className="w-4 h-4 mr-2" />
                下载
              </Button>
              <Button variant="outline" onClick={closePreview} className="border-white/20 text-white hover:bg-white/10">关闭</Button>
            </div>
            {previewImage.type === 'video' || isVideoUrl(previewImage.url) ? (
              <p className="mt-4 text-white/40 text-xs">点击画面外关闭，左右滑动切换，使用下方按钮控制声音</p>
            ) : (
              <p className="mt-4 text-white/40 text-xs">按 ← → 或左右滑动切换，ESC 关闭预览</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
