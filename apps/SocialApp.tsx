import { loadCharacterContextMessages } from '../utils/chatContextRange';
import { injectMemoryPalace } from '../utils/memoryPalace/pipeline';

import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
// 六改-3：codepointToEmoji / SparkPostImage 抽到 ./social/SparkPostImage.tsx，
// 与聊天侧 social_card 卡片共用（原来聊天侧把 sparkimg: 引用当文本铺出来的 bug 就在这修）。
import { codepointToEmoji, pickSparkFeedEmoji, SparkPostImage } from './social/SparkPostImage';
import { AppID, CharacterProfile, SocialPost, SocialComment, SubAccount, SocialAppProfile, SparkCircle } from '../types';
import { buildSparkCommentHistory, buildSparkGenerationContext, resolveSparkAuthor, selectSparkParticipants, sparkCommentCandidatePool, SparkCircleWorld } from '../utils/socialGeneration';
import { canSparkPrivateChat, findSparkReplyTarget, mergeSparkMentionIds, splitSparkCommentItem, unusedPostMentionIds } from '../utils/sparkCommentParse';
import { loadSparkCircles, saveSparkCircles, loadActiveCircleId, saveActiveCircleId, filterPostsByCircle, SPARK_CIRCLE_ALL, loadTrackedSparkPosts, saveTrackedSparkPosts, trackSparkPost, untrackSparkPost, ensureSeenCommentIds, loadPrivateChatOff, setPrivateChatOff, loadSparkReplyWatermarks, saveSparkReplyWatermark, loadMomentsPostOn, setMomentsPostOn } from '../utils/sparkCircles';
import { processImageToBlob } from '../utils/file';
import { putImageBlob } from '../utils/blobRef';
import Modal from '../components/os/Modal';
import { extractContent, safeResponseJson } from '../utils/safeApi';
import { CharacterGroupFilterBar, filterCharactersByGroup, GROUP_FILTER_ALL } from '../components/character/CharacterGroupFilter';
import { House, User, Package, Warning, Pencil, Trash } from '@phosphor-icons/react';
import { mergeSocialComments, prependUniqueSocialPosts, updateSocialPost } from '../utils/socialFeedMerge';
import { trackEvent } from '../utils/analytics';
import TokenImg from '../components/os/TokenImg';
// v8c-1（Ann 2026-09-16）：Spark 角色头像统一走 resolver —— 自定义 > 主聊天头像 > 生成时快照 > 名字 hash
import { resolveSparkCharAvatar, setSparkCharAvatar, sparkStrangerAvatar, syncSparkLiveAvatars } from '../utils/sparkAvatar';

const TWEMOJI_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72';
const twemojiUrl = (codepoint: string) => `${TWEMOJI_BASE}/${codepoint}.png`;

const apiErrorMessage = async (response: Response): Promise<string> => {
    let detail = '';
    try {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            detail = json?.error?.message || json?.message || json?.error || '';
        } catch {
            detail = text;
        }
    } catch { /* ignore unreadable error bodies */ }
    const compact = String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    return `HTTP ${response.status}${compact ? `: ${compact}` : ''}`;
};

const STICKER_OPTIONS = [
    { code: '2728', label: 'sparkles' },
    { code: '1f388', label: 'balloon' },
    { code: '1f3a8', label: 'palette' },
    { code: '1f4f7', label: 'camera' },
    { code: '1f3b5', label: 'music' },
    { code: '1f3ae', label: 'game' },
    { code: '1f354', label: 'burger' },
    { code: '1f3d6-fe0f', label: 'beach' },
    { code: '1f4a4', label: 'sleep' },
    { code: '1f4a1', label: 'idea' },
];
const STICKER_CHAR_TO_CODE: Record<string, string> = {
    '✨': '2728', '🎈': '1f388', '🎨': '1f3a8', '📷': '1f4f7', '🎵': '1f3b5',
    '🎮': '1f3ae', '🍔': '1f354', '🏖️': '1f3d6-fe0f', '💤': '1f4a4', '💡': '1f4a1',
};

// --- Constants & Styles ---
const BRAND_COLOR = '#ff2442'; // Premium Red

// Advanced Gradients for "Image" backgrounds
const POST_STYLES = [
    { name: 'Sunset', bg: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 99%, #FECFEF 100%)', text: '#fff' },
    { name: 'Ocean', bg: 'linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)', text: '#fff' },
    { name: 'Peach', bg: 'linear-gradient(to top, #fff1eb 0%, #ace0f9 100%)', text: '#555' },
    { name: 'Night', bg: 'linear-gradient(to top, #30cfd0 0%, #330867 100%)', text: '#fff' },
    { name: 'Love', bg: 'linear-gradient(to top, #f43b47 0%, #453a94 100%)', text: '#fff' },
    { name: 'Fresh', bg: 'linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)', text: '#444' },
    { name: 'Lemon', bg: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)', text: '#fff' },
    { name: 'Plum', bg: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)', text: '#fff' },
];

const getRandomStyle = () => POST_STYLES[Math.floor(Math.random() * POST_STYLES.length)];

// --- Robust JSON Parser ---
const safeParseJSON = (input: string) => {
    const clean = input.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        const parsed = JSON.parse(clean);
        if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed);
            if (keys.length === 1 && Array.isArray(parsed[keys[0]])) {
                return parsed[keys[0]];
            }
        }
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        try {
            const start = clean.indexOf('[');
            if (start === -1) return [];
            let end = clean.lastIndexOf('}');
            while (end > start) {
                const attempt = clean.substring(start, end + 1) + ']';
                try {
                    const result = JSON.parse(attempt);
                    if (Array.isArray(result)) return result;
                } catch (err) {}
                end = clean.lastIndexOf('}', end - 1);
            }
            return [];
        } catch (e2) {
            return [];
        }
    }
};

// --- Icons ---

const Icons = {
    Heart: ({ filled, onClick, className }: { filled?: boolean, onClick?: (e: any) => void, className?: string }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={filled ? BRAND_COLOR : "none"} stroke={filled ? BRAND_COLOR : "currentColor"} strokeWidth={2} className={`transition-transform active:scale-75 cursor-pointer ${className || "w-6 h-6"}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
    ),
    Star: ({ filled, onClick, className }: { filled?: boolean, onClick?: (e: any) => void, className?: string }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={filled ? "#fbbf24" : "none"} stroke={filled ? "#fbbf24" : "currentColor"} strokeWidth={2} className={`transition-transform active:scale-75 cursor-pointer ${className || "w-6 h-6"}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.563.563 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
    ),
    Share: ({ className, onClick }: { className?: string, onClick?: () => void }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className || "w-6 h-6"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
        </svg>
    ),
    ChatBubble: ({ className }: { className?: string }) => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className || "w-6 h-6"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
        </svg>
    ),
    Back: ({ onClick, className }: { onClick?: () => void, className?: string }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className || "w-6 h-6 cursor-pointer text-slate-800"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
    ),
    Plus: ({ className }: { className?: string }) => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className || "w-6 h-6"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
    ),
    Pencil: ({ className, onClick }: { className?: string, onClick?: () => void }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className || "w-4 h-4"}>
            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
        </svg>
    )
};

// 五修-5：Spark 用户帖图片组件已抽到 ./social/SparkPostImage.tsx（六改-3，聊天卡片共用）

// --- Main App ---

const SocialApp: React.FC = () => {
    // spark-follow 任务 1-C：补 openApp / setActiveCharacterId —— 点私聊条跳进对应角色聊天用
    const { closeApp, openApp, setActiveCharacterId, characters, updateCharacter, apiConfig, apiPresets, addToast, userProfile, groups, characterGroups } = useOS();
    const [feed, setFeed] = useState<SocialPost[]>([]);
    // Modes: 'home' (Feed) | 'me' (Profile) | 'create' (Modal Overlay)
    // spark-follow 2-C：三页 —— home=发现 | follow=关注（朋友圈） | me=用户主页（原「我的」整页迁到右下角人形）
    const [activeTab, setActiveTab] = useState<'home' | 'follow' | 'me'>('home');
    const [isCreateOpen, setIsCreateOpen] = useState(false); 
    
    const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadingComments, setLoadingComments] = useState(false);
    
    // Post Creation State
    const [newPostTitle, setNewPostTitle] = useState('');
    const [newPostContent, setNewPostContent] = useState('');
    const [newPostEmoji, setNewPostEmoji] = useState('2728');
    // 五修-4：用户发帖自定义 tag（中英文逗号/空格分隔；空 = 不打 tag，不再写死 ['User']）
    const [newPostTags, setNewPostTags] = useState('');
    // 五修-10：发帖 @ 的角色（charId 列表；发布时自动同步给这些角色并告知被艾特）
    const [newPostMentions, setNewPostMentions] = useState<string[]>([]);
    // v8c-2（Ann 2026-09-16）：发帖「圈子」（只附加该圈世界观原文，不限角色范围）+「不给谁看」（勾掉的角色不进生成池）
    const [newPostWorldCircleId, setNewPostWorldCircleId] = useState<string>('');
    const [newPostExcludedCharIds, setNewPostExcludedCharIds] = useState<string[]>([]);
    // spark-follow 2-F：关注帖编辑专用「谁可以看见」名单（只给 moments 帖用，不与 newPostExcludedCharIds 混）
    const [newPostVisibleCharIds, setNewPostVisibleCharIds] = useState<string[]>([]);
    // 五修-5：发帖图片（dataURL；发布时压缩后存 assets 表，帖子 images 存 sparkimg: 引用）
    const [newPostImages, setNewPostImages] = useState<string[]>([]);
    const newPostImageInputRef = useRef<HTMLInputElement>(null);
    // 五修-11：正在二次编辑的用户帖 id（null = 普通发布）
    const [editingPostId, setEditingPostId] = useState<string | null>(null);

    // Comment Input State
    const [commentInput, setCommentInput] = useState('');
    const [isReplyingToUser, setIsReplyingToUser] = useState(false);
    // 楼中楼：当前正在回复的目标评论（null = 直接评论帖子）
    const [replyTarget, setReplyTarget] = useState<SocialComment | null>(null);
    // 八改（Ann 复检反馈3）：评论原位编辑态（null = 非编辑；id+draft 供原位编辑框读写）
    const [editingComment, setEditingComment] = useState<{ id: string; draft: string } | null>(null);
    // 九改-3（Ann 复检反馈3）：删除评论确认弹层（小红书风格）。null = 关。
    // deleteNotify = 弹层里选中的方式：false 悄悄删除（原「取消」分支）/ true 删除并让角色知道（原「确定」分支）。
    const [deleteConfirm, setDeleteConfirm] = useState<{ post: SocialPost; comment: SocialComment } | null>(null);
    const [deleteNotify, setDeleteNotify] = useState(false);
    // 六改-2b：评论里 @ 的角色（用户亲手点选才记；有社交档案的发送后会收到真通知，无档案的置灰不可选）
    const [commentMentions, setCommentMentions] = useState<string[]>([]);
    // 六改-2b：评论弹层里的 @ 角色选择条开关
    const [composerMentionOpen, setComposerMentionOpen] = useState(false);
    // 七改-UI：底部评论输入弹层（xhs 复刻：点互动栏胶囊升起，遮罩/收起键/Esc 收回）
    const [composerOpen, setComposerOpen] = useState(false);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    // 七改-UI：楼中楼折叠状态（key = 根评论 id；默认全部折叠，Ann 拍板）
    const [expandedReplyGroups, setExpandedReplyGroups] = useState<Record<string, boolean>>({});
    // 七改-UI：每层楼的「已读回复数」水位（key = 根评论 id）。搅动/刷新后回复数超过水位
    // 且未展开 → 「展开 N 条回复」旁冒一次性红气泡；展开即更新水位，气泡消失。
    const seenRepliesRef = useRef<Record<string, number>>({});

    // spark-follow 功能 1（Ann 2026-09-17 施工单）：私聊弹窗条 —— 帖子详情顶上的微信式消息条。
    // 私聊写进聊天成功后入队；每句原文一条，每条 2 秒自动换下一条；点条跳进该角色私聊；关帖/开帖清空。
    // 纯演示条：不落库、不出详情页、没有声音和振动。
    const [followupQueue, setFollowupQueue] = useState<{ charId: string; name: string; avatar: string; firstLine: string }[]>([]);
    const [currentFollowup, setCurrentFollowup] = useState<{ charId: string; name: string; avatar: string; firstLine: string } | null>(null);
    const followupTimerRef = useRef<number | null>(null);
    // 队列推进拆成两段：当前为空才取下一条（队列变化不会打断正在显示的条）。
    // 每条真实私聊原文停 2 秒，按写入顺序一条一条过。
    useEffect(() => {
        if (currentFollowup) return;
        if (followupQueue.length === 0) return;
        const [head, ...rest] = followupQueue;
        setFollowupQueue(rest);
        setCurrentFollowup(head);
    }, [currentFollowup, followupQueue]);
    useEffect(() => {
        if (!currentFollowup) return;
        const t = window.setTimeout(() => {
            followupTimerRef.current = null;
            setCurrentFollowup(null);
        }, 1800);
        followupTimerRef.current = t;
        return () => { window.clearTimeout(t); };
    }, [currentFollowup]);

    // Settings / Handle Management
    const [showSettings, setShowSettings] = useState(false);
    const [characterHandles, setCharacterHandles] = useState<Record<string, SubAccount[]>>({});
    const [identityGroupId, setIdentityGroupId] = useState(GROUP_FILTER_ALL); // 身份管理弹窗的角色分组筛选
    const [, forceIdentityTick] = useState(0); // 私聊开关等 localStorage 直改后强制重渲染（同值 setState 会被 React 跳过）
    // v8c-1：每次渲染把当前主聊天头像喂给共用解析器（纯写模块缓存、幂等），
    // 这样聊天里的 Spark 卡片也跟主聊天头像走，不再只认生成时的快照。
    syncSparkLiveAvatars(characters);

    // v8c-1：Spark 角色头像设置面板（state）；linkDraft 非 null = 「填图片链接」已展开
    const [sparkAvatarEditChar, setSparkAvatarEditChar] = useState<{ id: string; name: string } | null>(null);
    const [sparkAvatarLinkDraft, setSparkAvatarLinkDraft] = useState<string | null>(null);
    const sparkCharAvatarInputRef = useRef<HTMLInputElement>(null);

    // Circles (平行世界圈子：用户自建，零预设)
    const [circles, setCircles] = useState<SparkCircle[]>(() => loadSparkCircles());
    const [activeCircleId, setActiveCircleId] = useState<string>(() => loadActiveCircleId());
    const [editingCircle, setEditingCircle] = useState<SparkCircle | null>(null); // 非 null = 编辑器打开（id 空 = 新建）

    // Spark 副API：从系统设置的预设里单独选一个用于 Spark 生成，省主 API 的量；不选 = 跟随主设置
    const [sparkApiPresetId, setSparkApiPresetId] = useState<string>(() => {
        try { return localStorage.getItem('spark_api_preset_id') || ''; } catch { return ''; }
    });
    const sparkApi = sparkApiPresetId ? (apiPresets.find(p => p.id === sparkApiPresetId)?.config ?? apiConfig) : apiConfig;

    // Sharing State
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareGroupId, setShareGroupId] = useState(GROUP_FILTER_ALL); // 分享帖子弹窗的角色分组筛选

    // Sync to Character（让角色知道自己在 Spark 的动态 → 聊天角色侧插 social_card）
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncGroupId, setSyncGroupId] = useState(GROUP_FILTER_ALL);

    // Profile Sub-tab
    const [profileTab, setProfileTab] = useState<'notes' | 'collects'>('notes');

    // User Custom Profile State (Local - Decoupled from Global UserProfile)
    const [socialProfile, setSocialProfile] = useState<SocialAppProfile>({
        name: userProfile.name,
        avatar: userProfile.avatar,
        bio: '这个人很懒，什么都没写。'
    });
    const [userSparkId, setUserSparkId] = useState('95279527');
    const [userBgImage, setUserBgImage] = useState('');
    const [isEditingId, setIsEditingId] = useState(false);
    
    const userBgInputRef = useRef<HTMLInputElement>(null);
    const socialAvatarInputRef = useRef<HTMLInputElement>(null);

    // Refs
    const commentsEndRef = useRef<HTMLDivElement>(null);
    const detailScrollRef = useRef<HTMLDivElement>(null);
    const feedRef = useRef<SocialPost[]>([]);
    const mountedRef = useRef(true);
    const refreshRequestRef = useRef<AbortController | null>(null);
    const commentRequestRef = useRef<{ postId: string; controller: AbortController } | null>(null);
    const replyRequestRef = useRef<{ postId: string; controller: AbortController } | null>(null);
    // 五修-1：用户最近一次评论的挂靠信息（供"搅动评论区"时让模型知道用户刚说了什么；
    // 搅动过一次后就清掉——再搅动就是普通时间流逝）
    const lastUserCommentRef = useRef<{ postId: string; userCommentId: string; repliedToCommentId?: string; content: string; mentionedCharIds?: string[] } | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            refreshRequestRef.current?.abort();
            commentRequestRef.current?.controller.abort();
            replyRequestRef.current?.controller.abort();
            refreshRequestRef.current = null;
            commentRequestRef.current = null;
            replyRequestRef.current = null;
        };
    }, []);

    useEffect(() => {
        DB.getSocialPosts().then(async posts => {
            if (posts.length > 0) {
                const sorted = posts.sort((a,b) => b.timestamp - a.timestamp);
                // IndexedDB can be slow on mobile. If the user already created
                // something while this read was pending, keep that live version.
                const liveIds = new Set(feedRef.current.map(post => post.id));
                let next = [...feedRef.current, ...sorted.filter(post => !liveIds.has(post.id))];
                // 存量迁移：旧 bug 圈子 id 为空 → 帖子存了 circleId: ''。
                // '' 无法确定属于哪个圈子（多个空 id 圈子撞车），统一归为无圈子帖
                // （与旧版实际显示行为一致：都在「全部」）。只重写命中的帖子。
                const badPosts = next.filter(p => p.circleId === '');
                if (badPosts.length > 0) {
                    const fixed = new Map(badPosts.map(p => [p.id, { ...p, circleId: undefined }]));
                    next = next.map(p => fixed.get(p.id) || p);
                    await Promise.all(badPosts.map(p => DB.saveSocialPost({ ...p, circleId: undefined })));
                }
                feedRef.current = next;
                setFeed(next);
            }
        });
        
        // Load User Config & Social Profile from DB assets and LocalStorage (hybrid migration)
        const loadAssets = async () => {
            const savedUserId = localStorage.getItem('spark_user_id');
            // Try load from DB first
            const dbBg = await DB.getAsset('spark_user_bg');
            const dbProfileStr = await DB.getAsset('spark_social_profile');
            
            // Fallback to localStorage if DB missing (Legacy migration)
            const lsBg = localStorage.getItem('spark_user_bg');
            const lsProfileStr = localStorage.getItem('spark_social_profile');

            if (savedUserId) setUserSparkId(savedUserId);
            
            if (dbBg) {
                setUserBgImage(dbBg);
            } else if (lsBg) {
                // Migrate to DB
                setUserBgImage(lsBg);
                await DB.saveAsset('spark_user_bg', lsBg);
                localStorage.removeItem('spark_user_bg');
            }
            
            let loadedProfile = null;
            if (dbProfileStr) {
                try { loadedProfile = JSON.parse(dbProfileStr); } catch(e) {}
            } else if (lsProfileStr) {
                try { loadedProfile = JSON.parse(lsProfileStr); } catch(e) {}
                // Migrate to DB
                if (loadedProfile) {
                    await DB.saveAsset('spark_social_profile', lsProfileStr!);
                    localStorage.removeItem('spark_social_profile');
                }
            }

            if (loadedProfile) {
                setSocialProfile(loadedProfile);
            } else {
                // Initial fallback to global user profile only once
                setSocialProfile({
                    name: userProfile.name,
                    avatar: userProfile.avatar,
                    bio: userProfile.bio || '这个人很懒，什么都没写。'
                });
            }
        };
        loadAssets();

        // Load Handles
        const savedHandles = localStorage.getItem('spark_char_handles');
        let initialHandles: Record<string, SubAccount[]> = {};
        if (savedHandles) {
            try { initialHandles = JSON.parse(savedHandles); } catch(e) {}
        }
        
        // Ensure every character has at least one default handle
        characters.forEach(c => {
            if (!initialHandles[c.id] || initialHandles[c.id].length === 0) {
                initialHandles[c.id] = [{ 
                    id: 'default', 
                    handle: c.socialProfile?.handle || c.name, 
                    note: '主账号' 
                }];
            }
        });
        setCharacterHandles(initialHandles);

    }, [characters.length]);

    // Save Handles to LocalStorage whenever updated
    useEffect(() => {
        if (Object.keys(characterHandles).length > 0) {
            localStorage.setItem('spark_char_handles', JSON.stringify(characterHandles));
        }
    }, [characterHandles]);

    // Save Circles to LocalStorage whenever updated
    useEffect(() => {
        saveSparkCircles(circles);
    }, [circles]);

    // 聊天里点 social_card 卡片跳回原帖。
    // 旧版挂载时"读到 key 就立刻删"——dev 有 StrictMode 双挂载：第一个实例把 key 读走删掉，
    // 真正存活的第二个实例读不到，跳转必落空。改成"轮询消费"：key 在且找到帖子才删；
    // 5 秒没等到就清 key 停手——P7：Chat 侧点卡前已查活，走到超时只剩竞态窗口
    // （点了卡、几秒内帖子被清空），此时查无此帖即止，不再保留 key 反复空跳。
    useEffect(() => {
        const deadline = Date.now() + 5000;
        const timer = setInterval(() => {
            let jumpId: string | null = null;
            try { jumpId = localStorage.getItem('spark_jump_post_id'); } catch {}
            if (!jumpId) { clearInterval(timer); return; }
            const target = feedRef.current.find(p => p.id === jumpId);
            if (target) {
                clearInterval(timer);
                try { localStorage.removeItem('spark_jump_post_id'); } catch {}
                // 目标帖可能在别的圈子：切过去再开详情，列表上下文才对得上
                if (target.circleId && target.circleId !== activeCircleIdRef.current) {
                    switchCircle(target.circleId);
                }
                // v9 四修（Ann 复检命中）：私聊跳帖也要走水位初始化，否则冒满屏红点
                initReplyWatermarks(target);
                setSelectedPost(target);
            } else if (Date.now() > deadline) {
                clearInterval(timer);
                try { localStorage.removeItem('spark_jump_post_id'); } catch {}
                addToast('原帖已经不在了', 'info');
            }
        }, 200);
        return () => clearInterval(timer);
    }, []);

    // --- Circle Actions ---
    const activeCircle = activeCircleId === SPARK_CIRCLE_ALL ? undefined : circles.find(c => c.id === activeCircleId);
    // 现存圈子 id 集合：识别"孤儿帖"（圈子已删），让它们回收进「全部」
    const validCircleIds = new Set(circles.map(c => c.id));
    // 跳转 effect（挂载时启动）需要读"当前"活跃圈子，但 switchCircle 定义在其后 → 用 ref 桥接
    const activeCircleIdRef = useRef(activeCircleId);
    activeCircleIdRef.current = activeCircleId;

    const switchCircle = (id: string) => {
        setActiveCircleId(id);
        saveActiveCircleId(id);
        setSelectedPost(null); // 切圈子关掉残留详情页，两边不互通
        trackEvent('切换 Spark 圈子', { view: id === SPARK_CIRCLE_ALL ? 'all' : 'circle' });
    };

    const startCreateCircle = () => {
        setEditingCircle({ id: '', name: '', worldPrompt: '', memberCharIds: [], createdAt: 0 });
    };

    const toggleCircleMember = (charId: string) => {
        setEditingCircle(current => {
            if (!current) return current;
            const has = current.memberCharIds.includes(charId);
            return { ...current, memberCharIds: has ? current.memberCharIds.filter(id => id !== charId) : [...current.memberCharIds, charId] };
        });
    };

    const saveEditingCircle = () => {
        if (!editingCircle) return;
        const name = editingCircle.name.trim();
        if (!name) { addToast('请给圈子起个名字', 'error'); return; }
        if (editingCircle.memberCharIds.length === 0) { addToast('圈子至少要选一个角色', 'error'); return; }
        const isNew = !editingCircle.id;
        // 新建圈子必须发真实 id：旧 bug 是 id 留空，帖子 circleId 存了 ''（falsy）
        // 被当成无圈子帖串进「全部」，评论候选池也回退成全角色
        const finalCircle: SparkCircle = {
            ...editingCircle,
            id: isNew ? `circle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : editingCircle.id,
            name,
            createdAt: editingCircle.createdAt || Date.now(),
        };
        setCircles(prev => isNew ? [...prev, finalCircle] : prev.map(c => c.id === finalCircle.id ? finalCircle : c));
        trackEvent(isNew ? '创建 Spark 圈子' : '编辑 Spark 圈子');
        setEditingCircle(null);
        addToast(isNew ? '圈子已创建' : '圈子已保存', 'success');
    };

    const deleteCircle = (circleId: string) => {
        // 九改-b（Ann 下午复检 3）：手滑删世界 → 删前确认（与删评论同款 confirm 风格）
        const name = circles.find(c => c.id === circleId)?.name || '';
        if (!window.confirm(`删除圈子「${name}」？帖子会保留在「全部」`)) return;
        setCircles(prev => prev.filter(c => c.id !== circleId));
        if (activeCircleId === circleId) switchCircle(SPARK_CIRCLE_ALL);
        trackEvent('删除 Spark 圈子');
        addToast('圈子已删除，其帖子保留在「全部」', 'success');
    };

    // 五修-6：不再自动滚动。旧逻辑在打开帖子时会误判"评论新增"直接飞到底部，
    // Ann 要求看帖滚动完全交给用户自己（AI 回复来了也不抢滚动）。

    // --- Helpers ---

    const addSubAccount = (charId: string) => {
        const newAcct: SubAccount = {
            id: `sub-${Date.now()}`,
            handle: '新马甲',
            note: '身份备注'
        };
        setCharacterHandles(prev => ({
            ...prev,
            [charId]: [...(prev[charId] || []), newAcct]
        }));
        trackEvent('给角色添加一个马甲');
    };

    const updateSubAccount = (charId: string, acctId: string, field: keyof SubAccount, value: string) => {
        setCharacterHandles(prev => ({
            ...prev,
            [charId]: prev[charId].map(a => a.id === acctId ? { ...a, [field]: value } : a)
        }));
    };

    const deleteSubAccount = (charId: string, acctId: string) => {
        setCharacterHandles(prev => ({
            ...prev,
            [charId]: prev[charId].filter(a => a.id !== acctId)
        }));
    };

    const handleUserBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                // 背景图存二进制：assets 行里只留 blobref 令牌，渲染走 TokenImg。
                // 旧令牌不主动删（同一张图可能被别处引用），交给孤儿 GC。
                const blob = await processImageToBlob(file, { skipCompression: true });
                const ref = await putImageBlob(blob);
                setUserBgImage(ref);
                // Save to DB Assets
                await DB.saveAsset('spark_user_bg', ref);
                addToast('背景图已更新', 'success');
            } catch (err) {
                addToast('图片处理失败', 'error');
            }
        }
    };

    const handleSocialAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                // 头像同样只存令牌；这里改的是 socialProfile 内存态，
                // 落库在 saveUserProfileChanges（点「保存资料」时整个 JSON 写回）。
                const blob = await processImageToBlob(file);
                const ref = await putImageBlob(blob);
                setSocialProfile(prev => ({ ...prev, avatar: ref }));
                trackEvent('更换 Spark 头像');
            } catch (err: any) {
                addToast(err.message, 'error');
            }
        }
    };

    // v8c-1（Ann 2026-09-16）：Spark 角色头像自定义——只在 Spark 里生效，不动主聊天头像；
    // 「恢复默认」= 清掉自定义，回落主聊天头像。localStorage 直改不驱动 React，改完 forceIdentityTick 强刷。
    const handleSparkCharAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const target = sparkAvatarEditChar;
        e.target.value = '';
        if (!file || !target) return;
        try {
            const blob = await processImageToBlob(file);
            const ref = await putImageBlob(blob);
            setSparkCharAvatar(target.id, ref);
            forceIdentityTick(t => t + 1);
            addToast(`${target.name} 的 Spark 头像已更新`, 'success');
            setSparkAvatarEditChar(null);
            setSparkAvatarLinkDraft(null);
        } catch (err: any) {
            addToast(err?.message || '图片处理失败', 'error');
        }
    };

    const saveSparkCharAvatarLink = () => {
        const target = sparkAvatarEditChar;
        if (!target) return;
        const url = (sparkAvatarLinkDraft || '').trim();
        if (!url) { addToast('链接不能为空', 'error'); return; }
        setSparkCharAvatar(target.id, url);
        forceIdentityTick(t => t + 1);
        addToast(`${target.name} 的 Spark 头像已更新`, 'success');
        setSparkAvatarEditChar(null);
        setSparkAvatarLinkDraft(null);
    };

    const resetSparkCharAvatar = () => {
        const target = sparkAvatarEditChar;
        if (!target) return;
        setSparkCharAvatar(target.id, null);
        forceIdentityTick(t => t + 1);
        addToast(`${target.name} 的 Spark 头像已恢复默认`, 'info');
        setSparkAvatarEditChar(null);
        setSparkAvatarLinkDraft(null);
    };

    const saveUserProfileChanges = async () => {
        localStorage.setItem('spark_user_id', userSparkId);
        // Save Profile to DB Assets（avatar 是 blobref 令牌，二进制在 IndexedDB）
        await DB.saveAsset('spark_social_profile', JSON.stringify(socialProfile));
        setIsEditingId(false);
        addToast('主页资料已保存 (仅在 Spark 生效)', 'success');
    };

    const prependPostsToFeed = (newPosts: SocialPost[]) => {
        const next = prependUniqueSocialPosts(feedRef.current, newPosts);
        feedRef.current = next;
        setFeed(next);
        // Only persist the new batch. Re-saving the request's stale feed snapshot
        // could erase comments or user posts that arrived while it was running.
        Promise.all(newPosts.map(p => DB.saveSocialPost(p))).catch(console.error);
    };

    const updatePostInFeed = (postId: string, updater: (post: SocialPost) => SocialPost): SocialPost | undefined => {
        const result = updateSocialPost(feedRef.current, postId, updater);
        if (!result.post) return undefined;
        feedRef.current = result.feed;
        setFeed(result.feed);
        setSelectedPost(current => (current?.id === postId ? result.post! : current));
        DB.saveSocialPost(result.post).catch(console.error);
        // 帖子追踪：已通知名单里没有的评论 id → 给追踪角色追加「新动态」通知（id 名单制，删评论/连发多条评论都不错位）。
        // 通知是 user 侧 social_card（syncKind: 'update'）：UI 渲染成卡片，上下文里角色看得到新评论内容。
        try {
            const tracked = loadTrackedSparkPosts();
            const entry = tracked[postId];
            if (entry) {
                const all = result.post.comments || [];
                const seen = ensureSeenCommentIds(entry, all);
                const newComments = all.filter(c => !seen.includes(c.id));
                if (newComments.length) {
                    console.debug('[Spark][追踪通知]', postId, { seenCount: seen.length, newIds: newComments.map(c => c.id) });
                    Promise.all(entry.charIds.map(charId =>
                        // spark-follow 2-I：moments 帖的追踪通知卡写「关注有新动静」；别的帖原样（外层已守卫 result.post 非空，回调内用 ?. 保类型安全）
                        DB.saveMessage({ charId, role: 'user', type: 'social_card', content: result.post?.origin === 'moments' ? '[Spark 关注有新动静]' : '[Spark 帖子动态更新]', metadata: { post: result.post, syncKind: 'update', newComments } }),
                    )).catch(console.error);
                    entry.seenCommentIds = [...seen, ...newComments.map(c => c.id)];
                    entry.lastSyncedCommentCount = all.length; // 兼容字段，不参与判定
                    saveTrackedSparkPosts(tracked);
                }
            }
        } catch {}
        return result.post;
    };

    const removePostFromFeed = (postId: string) => {
        const next = feedRef.current.filter(p => p.id !== postId);
        feedRef.current = next;
        setFeed(next);
        DB.deleteSocialPost(postId);
        setSelectedPost(current => (current?.id === postId ? null : current));
    };

    // --- AI Logic (Updated for Multi-Handle + Circles) ---
    const buildGenerationContext = async (participants: CharacterProfile[], circle?: SparkCircleWorld) => {
        const recent = await Promise.all(participants.map(async char => {
            const msgs = await loadCharacterContextMessages(char);
            // P1：Spark 生成前刷新记忆宫殿召回（与主聊天 chatRequestPayload 同一步骤）。
            // buildCoreContext 只读 char.memoryPalaceInjection 字段，而该字段全靠
            // injectMemoryPalace 刷新——原三条 Spark 生成路径从不调它，召回一直是空/旧的。
            // injectMemoryPalace 内部自管 memoryPalaceEnabled 开关；失败时退回旧注入，不炸生成。
            try {
                await injectMemoryPalace(char, msgs, undefined, userProfile.name, { entryPoint: 'spark' });
            } catch (e) {
                console.warn('[Spark] 记忆宫殿召回失败，沿用旧注入:', e);
            }
            return [char.id, msgs] as const;
        }));
        return buildSparkGenerationContext(participants, userProfile, socialProfile, characterHandles, Object.fromEntries(recent), circle);
    };

    const handleRefresh = async () => {
        if (!sparkApi.apiKey) { addToast('请配置 API Key', 'error'); return; }
        if (refreshRequestRef.current) return;
        const controller = new AbortController();
        refreshRequestRef.current = controller;
        setIsRefreshing(true);
        trackEvent('刷新 Spark 推荐流');
        try {
            // 圈子模式：候选池限定圈内成员；「全部」= 原版全角色随机
            const pool = activeCircle ? characters.filter(c => activeCircle.memberCharIds.includes(c.id)) : characters;
            const selectedChars = [...pool].sort(() => 0.5 - Math.random()).slice(0, Math.min(3, pool.length));

            const context = await buildGenerationContext(selectedChars, activeCircle);
            if (controller.signal.aborted) return;

            // 定稿（2026-09-16 凌晨）：群像作者视角，比例条数保留，路人立人设适配发帖生态
            const prompt = `### 任务: 模拟社交APP "Spark" 的推荐流
你是社交APP "Spark" 的推荐流的群像作者：你需要生成 6-8 条新的社交媒体帖子。
这里是虚拟社区，帖子切实写有内容的东西，不要空泛地当个标题党，不要说套话。
不要机械复读同一个梗；保持每位发帖者区别明显，让他们像常来的活人，
不要都像播报员。

### 内容构成 (混合模式)
1. **角色发帖 (30%)**:
   - 选中的角色: ${selectedChars.map(c => c.name).join(', ')}
   - 每条角色帖都要确定归属：isCharacter 填 true、charId 填该角色的 ID，帖子内容根据
     Ta 的人格、记忆和当前状态来写——Ta 最近经历过什么、在在意什么，就会发什么。
   - 再按内容给 Ta 选合适的马甲账号（吐槽用小号、发美照用大号），authorName 填马甲网名。
   - 内容方向：公开发言，生活日常、吐槽、暗戳戳的记录都行。

2. **路人发帖 (70%)**:
   生成每条路人帖前，先给这个发帖的路人立一个具体人设：
   - 网名符合现实社交媒体的常见命名习惯（大小写混排、下划线、数字缀、叠词、缩写都行），
     并且符合当前的世界限制规则。
   - 身份从设定世界的网民生态里随机取：学生、小孩、上班族、外国人、店主、自由职业者、
     退休老人、深夜冲浪的年轻人……甚至宠物、恶魔、捏捏、代码——只要符合当前世界观。
   - 带不同的年龄、职业、说话习惯、此刻发帖场景（地铁上、睡前、摸鱼中）、
     心情（开心、疑惑、难过、愤世嫉俗、无聊）、需求（正义感、想被治愈、想便宜收东西、
     想请教、想分享）。禁止死板照抄例子。
   - 发帖的动机和立场各自不同：有人分享日常、有人吐槽发泄、有人求助提问、有人晒物炫耀、
     有人记录遇到的怪事、有人找人搭子——站在不同位置发帖，别每条都一个腔调、一个题材。
   - 帖子长短不一：有人认真长文输出，有人就一句话。${activeCircle ? `
   - **本社区属于「${activeCircle.name}」世界**：路人也是该世界的居民，网名、话题、
     知识都必须符合该世界观（见系统设定），禁止出现不属于该世界的事物。` : ''}

### 禁令
- 绝对禁止生成 authorName 等于或近似 "${socialProfile.name}"（用户）的帖子。
- 路人帖的 authorName 必须是全新的网名，绝对不能与上方【角色身份表】中列出的任何马甲网名重合。
- 禁止串记忆：用户和角色的私聊内容、私下关系、彼此称呼、私人物品、私密回忆、私下约定，
  路人一律不知道，路人帖里不能出现、不能暗示；角色发帖只用 Ta 自己的记忆和经历，
  不能引用、暗示其他角色的私聊和私密信息。
- 正文里禁止出现任何 # 话题标记（#xx# 和 #xx 都不行），话题只写在 tags 字段里，
  content 是纯正文。
- 封面 emojis 只填一个真的表情符号，必须贴合该帖主题或心情（吃饭用🍜、加班用💻、下雨用🌧️、emo 用💔，按内容自己选）。任意表情都可以，禁止每条都用🎈或✨凑数，禁止把说明文字写进这个字段。
- 自检：任何一条帖子出现了上面禁止的内容，就地重写这条帖子。

### 输出格式 (JSON Array)
[
  {
    "isCharacter": true/false,
    "charId": "如果是角色填ID, 否则null",
    "authorName": "必须填身份表中定义的【网名】",
    "title": "简短吸睛的标题",
    "content": "正文内容...",
    "emojis": ["🍜"],
    "tags": ["按这条帖子的内容和发帖人视角自然打的 tag，数量不限（一条可以只有 1 个也可以打 5-6 个），像真实社交平台那样，中英文、长短、风格随意，贴合帖子主题就好。下面的示例仅供参考，禁止照抄：美食探店、深夜emo、职场吐槽、武侠日常、猫猫日记、健身打卡、旅行碎片"],
    "likes": 随机数 (0 - 10000)
  },
  ...
]`;
            const response = await fetch(`${sparkApi.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sparkApi.apiKey}` },
                body: JSON.stringify({ model: sparkApi.model, messages: [{ role: 'system', content: context }, { role: "user", content: prompt }], temperature: 0.8, max_tokens: 8000 }),
                signal: controller.signal,
                __sullyMeta: { appId: 'social', appName: 'Spark', purpose: '刷新推荐流' },
            } as RequestInit);
            if (!response.ok) throw new Error(await apiErrorMessage(response));
            const data = await safeResponseJson(response);
            if (controller.signal.aborted) return;
            const json = safeParseJSON(extractContent(data));
            if (!Array.isArray(json)) throw new Error('Parsed data is not an array');
            
            const newPosts: SocialPost[] = json
                .flatMap((item: any) => {
                const author = resolveSparkAuthor(item, selectedChars, pool, characterHandles, [socialProfile.name, userProfile.name]);
                if (!author || typeof item.content !== 'string' || !item.content.trim()) return [];
                item = { ...item, authorName: author.name };
                let avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${item.authorName}`;
                const matchedChar = author.character;
                if (matchedChar) avatar = matchedChar.avatar;
                const isCharacterPost = !!matchedChar;
                if (!isCharacterPost) {
                    const seeds = ['micah', 'avataaars', 'bottts', 'notionists'];
                    const styleIdx = [...item.authorName].reduce((s, ch) => s + ch.codePointAt(0)!, 0) % 4;
                    avatar = `https://api.dicebear.com/7.x/${seeds[styleIdx]}/svg?seed=${encodeURIComponent(item.authorName)}`;
                }
                // 封面贴纸：模型自选任意 emoji，不锁发帖面板那 10 个；解析不出才 ✨
                const images = [pickSparkFeedEmoji(item.emojis)];
                return [{
                    id: `post-${Date.now()}-${Math.random()}`,
                    authorName: item.authorName || 'Unknown',
                    authorAvatar: avatar,
                    title: typeof item.title === 'string' ? item.title : '无标题',
                    content: item.content || '...',
                    images,
                    likes: item.likes || 0,
                    isCollected: false,
                    isLiked: false,
                    comments: [],
                    timestamp: Date.now(),
                    // P8：tag 由模型按帖子和发帖人视角自由生成（数量不限）；没解析出有效 tag 才回退默认
                    tags: (() => {
                        const parsed = Array.isArray(item.tags)
                            ? item.tags.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim())
                            : [];
                        return parsed.length ? parsed : ['Life', 'Vlog'];
                    })(),
                    bgStyle: getRandomStyle().bg,
                    authorType: isCharacterPost ? 'character' as const : 'stranger' as const,
                    authorCharId: matchedChar?.id,
                    circleId: activeCircleId !== SPARK_CIRCLE_ALL ? activeCircleId : undefined,
                }];
            });
            if (!newPosts.length) throw new Error('模型返回的作者身份不匹配，未添加帖子');
            prependPostsToFeed(newPosts);
            addToast('首页已刷新: 冲浪模式开启', 'success');
        } catch (e: any) {
            if (e?.name !== 'AbortError') addToast('刷新失败: ' + e.message, 'error');
        } finally {
            if (refreshRequestRef.current === controller) {
                refreshRequestRef.current = null;
                if (mountedRef.current) setIsRefreshing(false);
            }
        }
    };

    const generateComments = async (post: SocialPost) => {
        if (!post || !sparkApi.apiKey) return;
        const livePost = feedRef.current.find(item => item.id === post.id) || post;
        if (livePost.comments.length > 0) return;
        if (commentRequestRef.current?.postId === post.id) return;
        commentRequestRef.current?.controller.abort();
        const controller = new AbortController();
        commentRequestRef.current = { postId: post.id, controller };
        post = livePost;
        setLoadingComments(true);
        try {
            // v8c-2（Ann 2026-09-16）：世界观按 post.worldCircleId 解析（与成员范围解耦）；
            // 用户帖的角色范围 = 全角色 −「不给谁看」；AI 帖照旧按 feed 圈子限定成员；旧帖保持原行为
            // spark-follow 2-E：关注帖不带圈子世界观（worldCircleId 被脏数据写上也忽略）；其余帖子按原逻辑解析圈子
            const postCircle = post.origin === 'moments'
                ? undefined
                : (post.worldCircleId
                    ? circles.find(c => c.id === post.worldCircleId)
                    : (post.authorType !== 'user' && post.circleId ? circles.find(c => c.id === post.circleId) : undefined));
            // spark-follow 2-E（Ann 2026-09-17）：候选池统一走 sparkCommentCandidatePool——
            // 关注帖 = 作者 + visibleCharIds；用户帖/圈子帖 = 原「三步构造」原样搬进 utils，行为一字不改
            const candidatePool = sparkCommentCandidatePool(post, characters, circles, loadTrackedSparkPosts()[post.id]?.charIds || []);
            const selectedChars = selectSparkParticipants(post, [...candidatePool].sort(() => 0.5 - Math.random()), characterHandles);
            const context = await buildGenerationContext(selectedChars, postCircle);
            if (controller.signal.aborted) return;
            
            let authorType = "Stranger";
            if (post.authorType === 'user') authorType = "User";
            else if (post.authorType === 'character' && post.authorCharId) {
                const c = characters.find(ch => ch.id === post.authorCharId);
                if (c) authorType = `Character "${c.name}"`;
            } else if (!post.authorType) {
                // Legacy fallback for posts saved before authorType was tracked.
                if (post.authorName === socialProfile.name) authorType = "User";
                else {
                    const c = characters.find(ch => {
                        const handles = characterHandles[ch.id] || [];
                        return handles.some(h => h.handle === post.authorName);
                    });
                    if (c) authorType = `Character "${c.name}"`;
                }
            }

            // v8d 任务 3b/3c（Ann 2026-09-17）：首评补 @ 点名节与私聊能力。
            // 点名节：帖子上有 @ 才渲染（文案=六-B 逐字）。
            // 私聊节：追踪名单里至少有一个人（被同步过 / 被 @ 过）就出现，用不用由 AI 看上下文决定；
            // 正文与搅动逐字一致（六-D），一字未改。
            const syncedIds = loadTrackedSparkPosts()[post.id]?.charIds || [];
            const unusedPostMentions = unusedPostMentionIds(post);
            const mentionSection = unusedPostMentions.length
                ? `## 用户点名的角色
用户发布这条笔记时 @ 到的角色：**这条笔记 Ta 收到了。Ta 怎么回应由人设决定，但这一轮必须出现，不会像没看见一样。**

`
                : '';
            const privateChatSection = syncedIds.length > 0 ? `### 私聊
角色有可以私聊用户的能力，可以用 "privateChat": ["内容1", "内容2"] 把想对用户一个人说的话直接发进
角色和用户的私聊——只有用户看得到，评论区不显示。
它承载的是只想让用户一个人听到的话：悄悄话、贴脸的话、想避开评论区认真聊几句的。
要不要私聊、什么时候私聊、说几条，跟在评论区发言一样——按角色当下的想法判断。
私聊的节奏跟着用户走：如果Ta 只是在帖子活动、有还没拿主意的事，不要急着替 Ta 做决定或把事情推进下去。
发私聊前先翻最近的私聊记录：你已经发过的内容，不要再重复发。

` : '';

            // 定稿（2026-09-16 凌晨）：Ann 逐字定稿——群像作者视角，首开评论区
            // spark-follow 2-E：关注帖（origin === 'moments'）整段换附录 B（逐字照抄；私聊节按追踪名单开关插入；
            // 关注没有发帖 @、首评时也没有用户评论，点名节不插）。其余帖子现有字符串一个字不改。
            const prompt = post.origin === 'moments'
                ? `### 任务: 模拟这条关注动态的评论区
**帖子来源**: Spark 关注
**楼主**: "${post.authorName}" (${authorType})
**帖子标题**: "${post.title}"
**帖子正文**:
"""
${post.content || '(楼主没写正文)'}
"""

你是这条关注动态评论区的群像作者：下面的评论和走向都由你根据这条动态当场写出来。
这不是公开推荐流里人人刷到的帖，这是楼主发在 Spark 关注上的一条动态——像朋友圈。看得见它的人（已经在你的角色名单里）才可能开口；名单里没有的角色，当他们没看见。

### 角色的出场节奏
看得见这条动态的角色，跟内容越相关越可能开口——Ta 的人格、记忆、最近在意的事跟这条动态越贴，越可能评论。相反，对该话题讨厌，避而不谈，没有兴趣或者普普通通的，更多是看见了划过去没说话。真人不会每条动态都评。楼主自己也可能再补一句，也可能发完就不再说话。尤其是对别人动态的倾诉欲是搁着一层社交面具的。（社交面具：指的是角色想要在关注里保持的形象，并非100%的现实原生性格，而是给别人看的侧面，与角色的人设，性格，心态和需求有关。）
一次的新评论保持自然的量（不超过 6 条），不要让角色和路人们一哄而上全部开口，评论应该缓缓展开讨论。
这里大家围着这条动态说话——接话、追问、反驳、围观、解释误会都行，
接着已有讨论往下走。评论要切实回复有内容的东西，不只对着标题空泛地说，不要说套话。
不要机械复读同一个梗；保持每位发言者前后语气连贯、区别明显，让他们像常来的活人，
不要都像播报员。
选定角色如果评论，要根据当前状态和关系进度评论。

${privateChatSection}### 路人（charId 为 null）：刷到这条动态的陌生网友
生成每条路人评论前，先给这个路人立一个具体人设：
- 网名符合现实社交媒体的常见命名习惯（大小写混排、下划线、数字缀、叠词、缩写都行），
  并且符合当前的世界限制规则。
- 身份从设定世界的网民生态里随机取：学生、小孩、上班族、外国人、店主、自由职业者、
  退休老人、深夜冲浪的年轻人……甚至宠物、恶魔、捏捏、代码——只要符合当前世界观。
- 带不同的年龄、职业、说话习惯、此刻刷帖场景（地铁上、睡前、摸鱼中）、
  心情（开心、疑惑、难过、愤世嫉俗、无聊）、需求（正义感、想被治愈、想便宜收东西、
  想请教、想分享）。禁止死板照抄例子。
- 立场和动机各自不同：有人赞同楼主想声援、有人反对想说服、有人觉得这事不至于、
  有人替另一方说话、有人想问清楚情况、有人有过类似经历要分享——站在不同位置看这事。
- 路人的信息量必须有限，能知道的只有：这条帖子的标题、正文、配图、tag、评论区
  已公开的内容、帖子上的昵称，以及他自己的人生经验。
- 路人和用户、和任何角色都是初次刷到的关系，别硬认。
- 路人的评论不一定跟用户与角色相关，由他的视角自然决定：大多数评论就是对着帖子本身说话——就事论事、玩梗、吐槽、科普，跟任何角色和用户都没有关系，不需要挖掘或呼应账号背后的人物与关系

### 禁令
- 绝对禁止生成 author 等于或近似 "${socialProfile.name}"（用户）的评论。
- 路人评论的 author 必须是全新的网名，绝对不能与上方【角色身份库】中列出的任何马甲网名重合。
- 禁止串记忆：用户和角色的私聊内容、私下关系、彼此称呼、私人物品、私密回忆、私下约定，
  路人一律不知道，不能出现、不能暗示、不能换说法转述；任何角色不得引用、暗示其他角色的
  私聊和私密信息。别的评论里提到的"我对象/我家那位"，默认是 Ta 自己生活里的人，和帖子里的
  其他任何人没有对应关系。
- 禁止复读：不重复已有评论说过的话，不机械复读同一个梗。
- 禁止无意义对话：每条评论都言之有物——对帖子或讨论有实际回应，不拿纯表情、纯语气词、
  纯打招呼凑数。
- 评论正文里禁止出现任何 # 话题标记（#xx# 和 #xx 都不行），评论就是纯说话。
- 自检：任何一条评论出现了上面禁止的内容，就地重写这条评论。

### 输出格式 (JSON Array)
[
  { "author": "网名 (Handle) 或 路人昵称", "charId": "角色ID或null", "content": "评论内容...", "replyTo": "被回复的评论作者名，不回复填null", "privateChat": ["想说的第一条", "第二条", ...] 或省略 }
]`
                : `### 任务: 模拟社交APP评论区
**帖子来源**: "Spark" 社区${postCircle ? `（所属世界:「${postCircle.name}」）` : ''}
**楼主**: "${post.authorName}" (${authorType})
**帖子标题**: "${post.title}"
**帖子正文**:
"""
${post.content || '(楼主没写正文)'}
"""

你是这条帖子评论区的群像作者：下面的评论和走向都由你根据这条帖子当场写出来，
### 角色的出场节奏
跟帖子内容越相关的角色，越可能开口——Ta 的人格、记忆、最近在意的事跟这条帖子越贴，越可能评论，像真人刷到自己在意的话题忍不住说话。相反，对该话题讨厌，避而不谈，没有兴趣或者普普通通的，跟帖子没什么关系的角色，更多是划过去没说话，真人不会逢帖必评。尤其是对网友的倾诉欲是搁着一层社交面具的。（社交面具：指的是角色想要在圈子里保持的形象，并非100%的现实原生性格，而是互联网的侧面的性格，与角色的人设，性格，心态和需求有关。）
一次的新评论保持自然的量（不超过 6 条），不要让角色和路人们一哄而上全部开口，评论应该缓缓展开讨论。
这里是虚拟社区，大家围着这条帖子说话——接话、追问、反驳、围观、解释误会都行，
接着已有讨论往下走。评论要切实回复有内容的东西，不只对着标题空泛地说，不要说套话。
不要机械复读同一个梗；保持每位发言者前后语气连贯、区别明显，让他们像常来的活人，
不要都像播报员。
选定角色如果评论，要根据当前状态和关系进度评论。

${mentionSection}${privateChatSection}### 路人（charId 为 null）：刷到这条帖子的陌生网友
生成每条路人评论前，先给这个路人立一个具体人设：
- 网名符合现实社交媒体的常见命名习惯（大小写混排、下划线、数字缀、叠词、缩写都行），
  并且符合当前的世界限制规则。
- 身份从设定世界的网民生态里随机取：学生、小孩、上班族、外国人、店主、自由职业者、
  退休老人、深夜冲浪的年轻人……甚至宠物、恶魔、捏捏、代码——只要符合当前世界观。
- 带不同的年龄、职业、说话习惯、此刻刷帖场景（地铁上、睡前、摸鱼中）、
  心情（开心、疑惑、难过、愤世嫉俗、无聊）、需求（正义感、想被治愈、想便宜收东西、
  想请教、想分享）。禁止死板照抄例子。
- 立场和动机各自不同：有人赞同楼主想声援、有人反对想说服、有人觉得这事不至于、
  有人替另一方说话、有人想问清楚情况、有人有过类似经历要分享——站在不同位置看这事。
- 路人的信息量必须有限，能知道的只有：这条帖子的标题、正文、配图、tag、评论区
  已公开的内容、帖子上的昵称，以及他自己的人生经验。
- 路人和用户、和任何角色都是初次刷到的关系，别硬认。
- 路人的评论不一定跟用户与角色相关，由他的视角自然决定：大多数评论就是对着帖子本身说话——就事论事、玩梗、吐槽、科普，跟任何角色和用户都没有关系，不需要挖掘或呼应账号背后的人物与关系

### 禁令
- 绝对禁止生成 author 等于或近似 "${socialProfile.name}"（用户）的评论。
- 路人评论的 author 必须是全新的网名，绝对不能与上方【角色身份库】中列出的任何马甲网名重合。
- 禁止串记忆：用户和角色的私聊内容、私下关系、彼此称呼、私人物品、私密回忆、私下约定，
  路人一律不知道，不能出现、不能暗示、不能换说法转述；任何角色不得引用、暗示其他角色的
  私聊和私密信息。别的评论里提到的"我对象/我家那位"，默认是 Ta 自己生活里的人，和帖子里的
  其他任何人没有对应关系。
- 禁止复读：不重复已有评论说过的话，不机械复读同一个梗。
- 禁止无意义对话：每条评论都言之有物——对帖子或讨论有实际回应，不拿纯表情、纯语气词、
  纯打招呼凑数。
- 评论正文里禁止出现任何 # 话题标记（#xx# 和 #xx 都不行），评论就是纯说话。
- 自检：任何一条评论出现了上面禁止的内容，就地重写这条评论。

### 输出格式 (JSON Array)
[
  { "author": "网名 (Handle) 或 路人昵称", "charId": "角色ID或null", "content": "评论内容...", "replyTo": "被回复的评论作者名，不回复填null", "privateChat": ["想说的第一条", "第二条", ...] 或省略 }
]`;
            // 五修-5：帖子带用户图时走识图构造（visionApi 优先 / 全局模型直发）
            const init = await buildSparkFetchInit(context, prompt, post, { temperature: 0.8, purpose: '生成帖子评论', signal: controller.signal });
            const response = await fetch(init.url, init as RequestInit);
            if (!response.ok) throw new Error(await apiErrorMessage(response));
            const data = await safeResponseJson(response);
            if (controller.signal.aborted) return;
            const json = safeParseJSON(extractContent(data));
            if (Array.isArray(json)) {
                // v8d 任务 3e（Ann 2026-09-17）：首评也能发私聊——落库与硬闸写法跟搅动完全一致，
                // 只有追踪名单里的角色能落库，且全局私聊开关没关。
                const privateMessages: { charId: string; lines: string[] }[] = [];
                const comments: SocialComment[] = json
                    .flatMap((c: any) => {
                        const author = resolveSparkAuthor(c, selectedChars, candidatePool, characterHandles, [socialProfile.name, userProfile.name]);
                        if (!author) return [];
                        const split = splitSparkCommentItem(c);
                        if (!split.publicContent && !split.privateLines.length) return [];
                        const char = author.character;
                        // 私聊硬闸只挡私聊：没同步 / 开关关 / 路人 → 丢掉私聊，公开评论照常落
                        if (split.privateLines.length && canSparkPrivateChat(char?.id, syncedIds, loadPrivateChatOff())) {
                            privateMessages.push({ charId: char!.id, lines: split.privateLines });
                        }
                        if (!split.publicContent) return [];
                        const authorName = author.name;
                        const avatar = char ? char.avatar : sparkStrangerAvatar(authorName);
                        return [{
                            id: `cmt-${Math.random()}`,
                            authorName: authorName,
                            authorAvatar: avatar,
                            content: split.publicContent,
                            likes: Math.floor(Math.random() * 100),
                            isCharacter: !!char,
                            authorType: char ? 'character' : 'stranger',
                            authorCharId: char?.id,
                            // 楼中楼先按作者名记，下面再统一映射成 id
                            _replyToName: (typeof c.replyTo === 'string' && c.replyTo.trim()) ? c.replyTo.trim() : undefined,
                        } as SocialComment & { _replyToName?: string }];
                    })
                    .map((c, _idx, arr) => {
                        // replyTo 作者名 → 本批已解析评论的 id（找不到就平铺，容错）
                        const { _replyToName, ...rest } = c;
                        if (!_replyToName) return rest;
                        const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
                        const target = arr.find(x => x !== c && eq(x.authorName, _replyToName));
                        return { ...rest, replyToId: target?.id };
                    });
                // v8d 任务 3e：私聊落主聊天（同搅动写法——首条带前空行、末条带后空行，读起来像真人一条接一条刷屏）
                // spark-follow 功能 1（1-A）：写库对象/顺序/失败处理原样不动；成功后不再弹 toast，
                // 改成收集 followupBatch，整个循环结束后一次接进弹窗队列（详情页顶上的微信条替代成功 toast）。
                const followupBatch: { charId: string; name: string; avatar: string; firstLine: string }[] = [];
                for (const pm of privateMessages) {
                    try {
                        const char = characters.find(c => c.id === pm.charId);
                        const avatar = resolveSparkCharAvatar(pm.charId, char?.avatar, char?.name || '');
                        const name = char?.name || '角色';
                        for (let i = 0; i < pm.lines.length; i++) {
                            const wrapped = `${i === 0 ? '\n' : ''}${pm.lines[i]}${i === pm.lines.length - 1 ? '\n' : ''}`;
                            await DB.saveMessage({ charId: pm.charId, role: 'assistant', type: 'text', content: wrapped });
                            const line = (pm.lines[i] || '').trim();
                            if (line) followupBatch.push({ charId: pm.charId, name, avatar, firstLine: line });
                        }
                        trackEvent('Spark 首评产生私聊消息');
                    } catch (e) {
                        console.warn('[Spark] 首评私聊落库失败', { charId: pm.charId, e });
                        addToast('私聊没能写进聊天', 'error');
                    }
                }
                if (followupBatch.length) setFollowupQueue(queue => [...queue, ...followupBatch]);
                // 只有私聊、没有公开评论时不算"身份不匹配"；两边都空才报错
                if (!comments.length && !privateMessages.length) throw new Error('模型返回的评论身份不匹配，未添加评论');
                if (comments.length) {
                    updatePostInFeed(post.id, current => ({
                        ...current,
                        comments: mergeSocialComments(current.comments || [], comments),
                    }));
                }
                if (unusedPostMentions.length) {
                    updatePostInFeed(post.id, current => ({ ...current, mentionForceUsed: true }));
                }
            }
        } catch (e: any) {
            if (e?.name !== 'AbortError') addToast(`评论加载失败: ${e?.message || e}`, 'error');
        } finally {
            if (commentRequestRef.current?.controller === controller) {
                commentRequestRef.current = null;
                if (mountedRef.current) setLoadingComments(false);
            }
        }
    };

    // 五修-1：原 generateRepliesToUser（"评论后立刻生成 1-3 条回复"）已整体移除，
    // 由下方 evolveCommentSection 取代——手动触发、时间流逝语义、产出与挂靠完全交给模型。

    const handleShare = async (targetId: string, isGroup: boolean) => {
        if (!selectedPost) return;
        try {
            await DB.saveMessage({ charId: isGroup ? 'user' : targetId, groupId: isGroup ? targetId : undefined, role: 'user', type: 'social_card', content: '[分享帖子]', metadata: { post: selectedPost } });
            // v9（Ann 拍板）：分享 = 作者纯净版，只发卡片，不注册追踪（追踪只住在底部同步星里）
            setShowShareModal(false);
            addToast('分享成功', 'success');
            trackEvent('分享帖子到聊天');
        } catch (e) { addToast('分享失败', 'error'); }
    };

    // 「让角色知道」：把帖子快照作为角色侧（assistant）social_card 存进聊天，
    // 下次角色回复时能看到「自己发布过/评论过这条动态」，卡片也渲染在角色那一侧。
    // 同时注册帖子追踪：之后这帖的新评论会以通知消息形式进角色上下文。
    // 五修-10：同步的核心实现（分享/「让角色知道」/@ 艾特 三条路共用）。
    // viaMention = 用户发帖时 @ 了该角色 → 卡片内容直接说明被艾特。
    const syncPostToChar = async (post: SocialPost, charId: string, viaMention = false, opts?: { skipTrack?: boolean }): Promise<boolean> => {
        const char = characters.find(c => c.id === charId);
        const handles = (characterHandles[charId] || []).map(h => h.handle);
        const isAuthor = post.authorCharId === charId || handles.includes(post.authorName);
        const myComment = (post.comments || []).find(c => c.authorCharId === charId || handles.includes(c.authorName));
        const syncKind: 'published' | 'commented' | 'viewed' = isAuthor ? 'published' : myComment ? 'commented' : 'viewed';
        // spark-follow 2-I：moments 帖换口吻——published → 发布了关注动态、viewed → 看见了关注动态；其余 Spark 卡一个字不改
        const kindLabel = viaMention
            ? '用户 @ 了你'
            : syncKind === 'published'
            ? (post.origin === 'moments' ? '发布了关注动态' : '发布了笔记')
            : syncKind === 'commented' ? '在帖子下留了言'
            : (post.origin === 'moments' ? '看见了关注动态' : '刷到了帖子');
        try {
            await DB.saveMessage({
                charId, role: 'assistant', type: 'social_card', content: `[Spark 动态·${kindLabel}]`,
                metadata: { post, syncKind, mentioned: viaMention },
            });
            if (!opts?.skipTrack) trackSparkPost(post.id, charId, (post.comments || []).map(c => c.id));
            return true;
        } catch (e) {
            console.warn('[Spark] 同步失败', { postId: post.id, charId, viaMention, e });
            return false;
        }
    };

    const sendSparkCommentUpdateCard = async (post: SocialPost, charId: string, newComments: SocialComment[]): Promise<void> => {
        await DB.saveMessage({
            charId, role: 'user', type: 'social_card', content: '[Spark 帖子动态更新]',
            metadata: { post, syncKind: 'update', newComments },
        });
    };

    const handleSyncToChar = async (charId: string) => {
        if (!selectedPost) return;
        const post = feedRef.current.find(item => item.id === selectedPost.id) || selectedPost;
        const ok = await syncPostToChar(post, charId);
        if (ok) {
            const char = characters.find(c => c.id === charId);
            setShowSyncModal(false);
            addToast(`${char?.name || '角色'} 现在知道这条动态了，帖子有新动态会同步给 Ta`, 'success');
            trackEvent('同步 Spark 动态给角色');
        } else { addToast('同步失败', 'error'); }
    };

    // 五修-5：选图 → 压缩（复用现成 canvas 轮子：长边 1280、JPEG 0.8，浏览器存储友好）
    const handleNewPostImages = async (files: FileList | null) => {
        if (!files?.length) return;
        const room = 9 - newPostImages.length;
        const list = Array.from(files).slice(0, Math.max(0, room));
        if (!list.length) { addToast('最多 9 张图', 'error'); return; }
        for (const file of list) {
            try {
                const blob = await processImageToBlob(file, { maxWidth: 1280, quality: 0.8, forceJpeg: true });
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                setNewPostImages(prev => (prev.length >= 9 ? prev : [...prev, dataUrl]));
            } catch (e: any) {
                addToast(`图片处理失败: ${e?.message || e}`, 'error');
            }
        }
    };

    // 五修-5：把压缩后的图存进 assets（spark_img_ 前缀，不进备份），返回帖子 images 引用
    const persistNewPostImages = async (dataUrls: string[]): Promise<string[]> => {
        const refs: string[] = [];
        for (const dataUrl of dataUrls) {
            const assetId = `spark_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await DB.saveAsset(assetId, dataUrl);
            refs.push(`sparkimg:${assetId}`);
        }
        return refs;
    };

    // 五修-5：清理帖子引用的图片 assets（删帖 / 编辑替换旧图时调用）
    const cleanupPostImageAssets = async (images: string[] | undefined) => {
        for (const v of images || []) {
            if (typeof v === 'string' && v.startsWith('sparkimg:')) {
                try { await DB.deleteAsset(v.slice('sparkimg:'.length)); } catch {}
            }
        }
    };

    // 解析发帖 tag 输入：中英文逗号/顿号/空格都算分隔符，去空去重；开头所有 # 全剥（v9 二轮：防 ##）
    const parsePostTags = (raw: string): string[] => {
        const tags = raw.split(/[,，、\s]+/).map(t => t.trim().replace(/^#+/, '')).filter(Boolean);
        return [...new Set(tags)];
    };

    // v9 二轮（Ann 反馈 4）：小红书 tag = 单 #。模型爱在正文里写老式「#话题#」，只洗显示不改存库数据：
    // 成对 #xx# → #xx（中间不带 #、限长 30）；单个 #xx 本来就正确，原样保留。
    const displayContent = (raw: string): string => raw.replace(/#([^#\n]{1,30})#/g, '#$1');

    // v9 二轮（Ann 参考图）：收藏位装饰数字——由帖子 id 稳定伪随机（同一帖永远同一个数，0-99），纯装饰不存库
    const decoCollectNum = (id: string): number => {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100;
        return h;
    };

    // v9 三修（Ann 拍板）：数字缩写——1000+ → 1k+，10000+ → 2w+，整数截断
    const fmtCount = (n: number): string => {
        if (n >= 10000) return `${Math.floor(n / 10000)}w+`;
        if (n >= 1000) return `${Math.floor(n / 1000)}k+`;
        return String(n);
    };

    // 五修-11：进入编辑模式——发布面板填充现有内容，保存时原地更新（id/评论/点赞/时间戳不变）
    const startEditPost = (post: SocialPost) => {
        setEditingPostId(post.id);
        setNewPostTitle(post.title === '无标题' ? '' : post.title);
        setNewPostContent(post.content);
        setNewPostTags((post.tags || []).join(', '));
        // 现有图是 emoji 贴纸码点则回填；是图片引用（五修-5 之后）则保留展示、编辑面板不动贴纸
        const first = (post.images || [])[0] || '';
        setNewPostEmoji(STICKER_CHAR_TO_CODE[first] || (/^[0-9a-fA-F-]+$/.test(first) ? first : '2728'));
        if (post.origin === 'moments') {
            // spark-follow 2-F：关注帖编辑只回填标题/正文/图 + 可见名单；圈子/不给谁看/@ 清成空（关注帖没有这些）
            setNewPostVisibleCharIds([...(post.visibleCharIds || [])]);
            setNewPostMentions([]);
            setNewPostWorldCircleId('');
            setNewPostExcludedCharIds([]);
        } else {
            // v8d 任务 5a（Ann 2026-09-17）：回填已有的 @ —— 编辑面板能看到原帖 @ 的角色，选择器可增可减
            setNewPostMentions([...(post.mentions || [])]);
            // v8c-2：回填「圈子」「不给谁看」，可改，改完对下一次生成生效
            setNewPostWorldCircleId(post.worldCircleId || '');
            setNewPostExcludedCharIds([...(post.excludedCharIds || [])]);
            setNewPostVisibleCharIds([]);
        }
        setIsCreateOpen(true);
    };

    const handleCreatePost = async () => {
        if (!newPostContent.trim()) return;
        // 五修-5：图片优先——选了图就存图（sparkimg: 引用），没选图保持 emoji 贴纸
        const imageRefs = newPostImages.length ? await persistNewPostImages(newPostImages) : null;
        if (editingPostId) {
            // spark-follow 2-F：关注帖编辑 —— 只更新标题/正文/图/visibleCharIds；保留 origin/作者/authorCharId；
            // 不写 excludedCharIds / mentions / worldCircleId / circleId。勾可见不对对方 syncPostToChar，取消可见不撤已发出去的卡。
            if (feedRef.current.find(p => p.id === editingPostId)?.origin === 'moments') {
                updatePostInFeed(editingPostId, current => ({
                    ...current,
                    title: newPostTitle || '无标题',
                    content: newPostContent,
                    images: imageRefs || [codepointToEmoji(newPostEmoji)],
                    // 九改-b（识图缓存）：本次换了图 → 作废旧描述（关注帖没图时 imageRefs 为 null，不影响）
                    imageCaption: imageRefs ? undefined : current.imageCaption,
                    visibleCharIds: [...newPostVisibleCharIds],
                }));
                setNewPostContent(''); setNewPostTitle(''); setNewPostTags(''); setNewPostImages([]);
                setNewPostWorldCircleId(''); setNewPostExcludedCharIds([]); setNewPostMentions([]);
                setNewPostVisibleCharIds([]);
                setEditingPostId(null);
                setIsCreateOpen(false);
                addToast('关注动态已更新', 'success');
                // 已发出去的作者卡同步新正文快照
                await syncPostSnapshotToChats(editingPostId);
                return;
            }
            // 二次编辑：原地更新，不改 id/评论/点赞/时间戳。
            // 图片策略：本次加了新图 → 替换并清理旧图 assets；没加图 → 保留原 images 不动
            if (imageRefs) {
                const oldImages = feedRef.current.find(p => p.id === editingPostId)?.images;
                await cleanupPostImageAssets(oldImages);
            }
            // v8d 任务 5b（Ann 2026-09-17）：先记下原帖 @ 名单，落定后只对「新增的 @」补同步链
            const beforeMentions = feedRef.current.find(p => p.id === editingPostId)?.mentions || [];
            const addedMentions = newPostMentions.filter(id => !beforeMentions.includes(id));
            updatePostInFeed(editingPostId, current => ({
                ...current,
                title: newPostTitle || '无标题',
                content: newPostContent,
                images: imageRefs || current.images,
                // 九改-b（识图缓存）：本次换了图 → 作废旧描述，下次生成评论重新识一次
                imageCaption: imageRefs ? undefined : current.imageCaption,
                tags: parsePostTags(newPostTags),
                // v8c-2：圈子/不给谁看可改，改完对下一次生成生效
                worldCircleId: newPostWorldCircleId || undefined,
                excludedCharIds: newPostExcludedCharIds.length ? [...newPostExcludedCharIds] : undefined,
                // v8d 任务 5b：@ 名单入库（原帖已有的保留、新勾的加上）
                mentions: [...newPostMentions],
                mentionForceUsed: addedMentions.length ? false : current.mentionForceUsed,
            }));
            setNewPostContent(''); setNewPostTitle(''); setNewPostTags(''); setNewPostImages([]);
            setNewPostWorldCircleId(''); setNewPostExcludedCharIds([]); setNewPostMentions([]);
            setNewPostVisibleCharIds([]);
            setEditingPostId(null);
            setIsCreateOpen(false);
            addToast('笔记已更新', 'success');
            // v8d 任务 5b：新增的 @ 走发帖分支同款同步链（记进追踪名单 + 帖子卡发进 Ta 的私聊）；
            // 原有 @ 不重复同步、不撤销。
            if (addedMentions.length) {
                const latest = feedRef.current.find(p => p.id === editingPostId);
                if (latest) {
                    let okCount = 0;
                    for (const cid of addedMentions) {
                        if (await syncPostToChar(latest, cid, true)) okCount++;
                    }
                    if (okCount) addToast(`已提醒 ${okCount} 个角色：你在帖子里 @ 了 Ta`, 'success');
                    else addToast('@ 提醒发送失败，请到帖子页手动同步', 'error');
                }
            }
            return;
        }
        const post: SocialPost = {
            id: `user-post-${Date.now()}`,
            authorName: socialProfile.name, // Use Local Identity
            authorAvatar: socialProfile.avatar, // Use Local Identity
            title: newPostTitle || '无标题',
            content: newPostContent,
            // 五修-5：有图存图（sparkimg: 引用），无图保持 emoji 贴纸（贴纸码点转真 emoji 字符）
            images: imageRefs || [codepointToEmoji(newPostEmoji)],
            // 九改-b（Ann 下午复检 9）：用户发帖点赞走随机——与刷新推荐流生成帖同一公式同一范围
            likes: Math.floor(Math.random() * 100),
            isCollected: false,
            isLiked: false,
            comments: [],
            timestamp: Date.now(),
            // 五修-4：tag 由用户自定义输入；没填就是空数组（不再写死 ['User']）
            tags: parsePostTags(newPostTags),
            // 五修-10：记录被 @ 的角色
            mentions: [...newPostMentions],
            bgStyle: getRandomStyle().bg,
            authorType: 'user',
            // 在哪个圈子发的就归哪个圈子（「全部」视图发的 = 无圈子帖，处处可见）
            circleId: activeCircleId !== SPARK_CIRCLE_ALL ? activeCircleId : undefined,
            // v8c-2：世界观来源圈子（选了才附加，和上面的 feed 分组解耦）+「不给谁看」名单
            worldCircleId: newPostWorldCircleId || undefined,
            excludedCharIds: newPostExcludedCharIds.length ? [...newPostExcludedCharIds] : undefined,
        };
        prependPostsToFeed([post]);
        setNewPostContent(''); setNewPostTitle(''); setNewPostTags(''); setNewPostImages([]);
        setNewPostWorldCircleId(''); setNewPostExcludedCharIds([]);
        setNewPostVisibleCharIds([]);
        setIsCreateOpen(false); // Close Modal
        setActiveTab('home'); 
        addToast('发布成功', 'success');
        // 五修-10：@ 的角色自动收到帖子（社交卡片 + 被艾特说明），之后评论回复走正常同步路子
        if (newPostMentions.length) {
            let okCount = 0;
            for (const cid of newPostMentions) {
                if (await syncPostToChar(post, cid, true)) okCount++;
            }
            if (okCount) addToast(`已提醒 ${okCount} 个角色：你在帖子里 @ 了 Ta`, 'success');
            else addToast('@ 提醒发送失败，请到帖子页手动同步', 'error');
        }
        setNewPostMentions([]);
    };

    const handleDeletePost = async (postId: string) => {
        // 五修-5：连带清理帖子引用的本地图片缓存（sparkimg: → assets）
        await cleanupPostImageAssets(feedRef.current.find(p => p.id === postId)?.images);
        removePostFromFeed(postId);
        addToast('帖子已删除', 'success');
        trackEvent('删除一条帖子');
    };

    // 五修-2：帖子评论发生变化（删/改）后，把最新评论列表原地写进所有"知道这条帖子"的
    // 聊天卡快照（用户分享卡 role:user + 角色侧同步卡 role:assistant，metadata.post 均为快照）。
    // 不保留旧记录——防止角色记忆里残留已被删除/修改的评论（污染记忆）。
    const syncPostSnapshotToChats = async (postId: string) => {
        const post = feedRef.current.find(p => p.id === postId);
        if (!post) return;
        // 六改-4a：同步名单 = 追踪该帖的角色 ∪ 在该帖发过言的角色（含楼中楼）。
        // 五修-2 原来只认追踪名单——只评论过、没被分享/同步/@登记的角色收不到快照改写，
        // 卡片里的旧评论一直留着（Ann 报的「删了评论聊天里还在」的根因）。
        const trackedIds = loadTrackedSparkPosts()[postId]?.charIds || [];
        const speakerIds = new Set<string>();
        for (const c of (post.comments || [])) {
            if (c.authorCharId) {
                speakerIds.add(c.authorCharId);
                continue;
            }
            // 老数据兜底：评论没存 authorCharId 时按马甲 handle 反查角色（与 syncPostToChar 同源逻辑）
            for (const [charId, subs] of Object.entries(characterHandles)) {
                if ((subs || []).some(h => h.handle === c.authorName)) speakerIds.add(charId);
            }
        }
        const charIds = [...new Set([...trackedIds, ...speakerIds])];
        // 九改-b（Ann 纠正口径）：删卡按「每张卡自己的快照」算，不看帖子全局空不空——
        //   · 动态更新卡（syncKind: 'update'）：它通知的那批 newComments 在帖子里全没了 → 这张卡真删；
        //     还有活着的 → 刷新快照（newComments 同步过滤）；
        //   · 首卡/角色侧同步卡：帖子正文空 且 评论删光 → 真删；否则保留、评论刷成最新（原有 update 逻辑）。
        const postEmptied = !(post.content || '').trim() && (post.comments || []).length === 0;
        // 九改-b（实测定位）：追踪通知卡渲染读的是 metadata.newComments（MessageItem 动态卡直接铺 c.content），
        // 只按 id 过滤、不换内容 → 评论改过之后卡上还是旧文字。这里统一把元素换成帖子里的最新对象：
        // 已删的自然过滤掉，还在的用最新内容（这也是「评论修改后聊天里还是旧评论」的根因）。
        const latestById = new Map((post.comments || []).map(c => [c.id, c]));
        const refreshNewComments = (list: any): any[] | undefined =>
            Array.isArray(list)
                ? list.map((nc: any) => latestById.get(nc?.id)).filter((c: any) => !!c)
                : list;
        for (const charId of charIds) {
            try {
                const msgs = await DB.getMessagesByCharId(charId, true);
                const cards = msgs.filter(m => m.type === 'social_card' && (m.metadata as any)?.post?.id === postId);
                console.debug('[Spark][快照同步]', postId, charId, cards.length);
                for (const card of cards) {
                    const meta: any = card.metadata || {};
                    const notified: any[] = Array.isArray(meta.newComments) ? meta.newComments : [];
                    // 动态更新卡：判它自己通知过的那批评论还剩几个活着（活着的一并换成最新内容）
                    if (meta.syncKind === 'update' && notified.length) {
                        const alive = refreshNewComments(notified)!;
                        if (!alive.length) {
                            await DB.deleteMessage(card.id);
                            continue;
                        }
                        await DB.updateMessageMetadata(card.id, (prev: any) => ({
                            ...prev,
                            post: { ...(prev?.post || {}), comments: post.comments },
                            newComments: alive,
                        }));
                        continue;
                    }
                    // 首卡/角色侧同步卡：只有正文空 + 评论删光才删
                    if (postEmptied) {
                        await DB.deleteMessage(card.id);
                        continue;
                    }
                    await DB.updateMessageMetadata(card.id, (prev: any) => ({
                        ...prev,
                        post: { ...(prev?.post || {}), comments: post.comments },
                        newComments: refreshNewComments(prev?.newComments),
                    }));
                }
            } catch {}
        }
    };

    // 五修-2：删除任意帖子下的任意评论（Ann：防错误回复污染记忆）。楼中楼子回复连带删除。
    // 可选让角色知道（RP 玩法：用户动了权限）→ 主聊天落一条系统记录。
    // 九改-3（Ann 复检反馈3）：原来开头两行 window.confirm 换成小红书风格确认弹层（见 deleteConfirm 渲染），
    // 本函数改为接收弹层结果的纯流程函数——只有 confirmed 才动数据，取消路径一行都不碰。
    const handleDeleteComment = async (post: SocialPost, comment: SocialComment, opts: { confirmed: boolean; notify: boolean }) => {
        if (!opts.confirmed) return;
        const notify = opts.notify;
        // 递归收集：被删评论 + 所有挂在它（直接或间接）楼下的回复
        const doomed = new Set<string>([comment.id]);
        let grew = true;
        const all = post.comments || [];
        while (grew) {
            grew = false;
            for (const c of all) {
                if (c.replyToId && doomed.has(c.replyToId) && !doomed.has(c.id)) {
                    doomed.add(c.id);
                    grew = true;
                }
            }
        }
        updatePostInFeed(post.id, current => ({
            ...current,
            comments: (current.comments || []).filter(c => !doomed.has(c.id)),
        }));
        addToast(doomed.size > 1 ? `已删除该回复及 ${doomed.size - 1} 条楼中楼` : '回复已删除', 'success');
        trackEvent('删除 Spark 评论');
        if (notify) {
            const charIds = loadTrackedSparkPosts()[post.id]?.charIds || [];
            const snippet = (comment.content || '').slice(0, 40);
            for (const charId of charIds) {
                try {
                    await DB.saveMessage({ charId, role: 'system', type: 'text', content: `[系统: ${userProfile.name} 行使管理权限，删除了《${post.title}》下 ${comment.authorName} 的一条回复（"${snippet}${(comment.content || '').length > 40 ? '…' : ''}"）。评论区里不会再有它。不要执着地把被删掉的内容再写一遍。]` });
                } catch {}
            }
        }
        await syncPostSnapshotToChats(post.id);
    };

    // 五修-2：编辑任意帖子下的任意评论（修正错误回复），改完同步快照
    // 八改（Ann 复检反馈3）：window.prompt → 原位编辑框（手机原生弹框输入不便）
    const saveEditingComment = async (post: SocialPost) => {
        if (!editingComment) return;
        const original = (post.comments || []).find(c => c.id === editingComment.id);
        const trimmed = editingComment.draft.trim();
        if (!trimmed || !original || trimmed === original.content) {
            setEditingComment(null);
            return;
        }
        updatePostInFeed(post.id, current => ({
            ...current,
            comments: (current.comments || []).map(c => c.id === editingComment.id ? { ...c, content: trimmed } : c),
        }));
        addToast('回复已修改', 'success');
        trackEvent('编辑 Spark 评论');
        await syncPostSnapshotToChats(post.id);
        setEditingComment(null);
    };
    const handleLike = (e: any, post: SocialPost) => {
        e.stopPropagation();
        updatePostInFeed(post.id, current => ({
            ...current,
            isLiked: !current.isLiked,
            likes: current.isLiked ? current.likes - 1 : current.likes + 1,
        }));
        trackEvent('点赞一条帖子', { action: post.isLiked ? 'unlike' : 'like' });
    };

    // 七改-UI：评论点赞（Ann 反馈 3）——乐观更新，isLiked 跟帖子一起落库，不回滚
    const handleLikeComment = (post: SocialPost, comment: SocialComment) => {
        updatePostInFeed(post.id, current => ({
            ...current,
            comments: (current.comments || []).map(c => c.id === comment.id
                ? { ...c, isLiked: !c.isLiked, likes: c.isLiked ? Math.max(0, c.likes - 1) : c.likes + 1 }
                : c),
        }));
        trackEvent('点赞一条评论');
    };
    
    const handleSendComment = async () => { 
        if (!selectedPost) return;
        // 五修-1：发评论和触发 AI 分离——
        //   输入框有字 → 只发评论（不再自动触发 AI 回复）；
        //   输入框为空时按同一个按钮 → 触发"评论区过一会儿的样子"模拟（不评论也能按）。
        if (!commentInput.trim()) {
            // v9 三修（Ann）：点搅动 → 输入弹层立刻收起，直接看评论区出反馈
            closeComposer();
            await refreshCommentSection();
            return;
        }
        if (commentRequestRef.current?.postId === selectedPost.id || replyRequestRef.current) return;

        const userComment: SocialComment = {
                id: `cmt-user-${Date.now()}`,
                authorName: socialProfile.name, // Use Local Identity
                authorAvatar: socialProfile.avatar, // Use Local Identity
                content: commentInput.trim(),
                likes: 0,
                isCharacter: false,
                authorType: 'user' as const,
                replyToId: replyTarget?.id, // 楼中楼：挂在被回复的评论下
        };
        // 水位 id 化后，用户评论自然命中 updatePostInFeed 的通用通知路径（新评论 id 不在名单里），直达链路和预推 hack 移除
        const updatedPost = updatePostInFeed(selectedPost.id, current => ({
            ...current,
            comments: mergeSocialComments(current.comments || [], [userComment]),
        }));
        // P3 保留：记录这次评论的挂靠信息，供之后手动"搅动"时让 AI 知道用户刚说了什么、在回复谁
        lastUserCommentRef.current = { postId: updatedPost?.id || selectedPost.id, userCommentId: userComment.id, repliedToCommentId: replyTarget?.id, content: commentInput, mentionedCharIds: [...commentMentions] };
        setCommentInput('');
        setReplyTarget(null);
        // 评论里用户亲手 @ 的角色 → 全员真通知（卡片进私聊，Ann 2026-09-15 定稿：默认角色名就是社交号，不设档案门槛）
        if (commentMentions.length && updatedPost) {
            let okCount = 0;
            // 以发这句 @ 之前的名单为准：未同步 = 帖子卡 + @ 卡，最后才入名单；已同步 = 只用追踪那一张动态卡
            const alreadyTracked = new Set(loadTrackedSparkPosts()[updatedPost.id]?.charIds || []);
            for (const cid of commentMentions) {
                try {
                    if (alreadyTracked.has(cid)) {
                        okCount++;
                        continue;
                    }
                    if (await syncPostToChar(updatedPost, cid, true, { skipTrack: true })) {
                        await sendSparkCommentUpdateCard(updatedPost, cid, [userComment]);
                        trackSparkPost(updatedPost.id, cid, (updatedPost.comments || []).map(c => c.id));
                        okCount++;
                    }
                } catch (e) {
                    console.warn('[Spark] 评论 @ 同步失败', { postId: updatedPost.id, charId: cid, e });
                }
            }
            if (okCount) addToast(`已提醒 ${okCount} 个角色：你在评论里 @ 了 Ta`, 'success');
            else addToast('@ 提醒发送失败，请到帖子页手动同步', 'error');
        }
        setCommentMentions([]);
        setComposerMentionOpen(false);
    };

    // 五修-1：搅动评论区——模拟"过一段时间后这个帖子的评论区变成了什么样"。
    // 不强制产出：可能没人说话。触发入口：帖子详情底部输入框为空时按按钮（发不发评论都行）。
    const refreshCommentSection = async () => {
        if (!selectedPost || !sparkApi.apiKey) return;
        if (replyRequestRef.current) return;
        const livePost = feedRef.current.find(item => item.id === selectedPost.id) || selectedPost;

        const controller = new AbortController();
        replyRequestRef.current = { postId: livePost.id, controller };
        setIsReplyingToUser(true);
        try {
            await evolveCommentSection(livePost, controller);
        } finally {
            if (replyRequestRef.current?.controller === controller) {
                replyRequestRef.current = null;
                if (mountedRef.current) setIsReplyingToUser(false);
            }
        }
    };

    // 九改-b（Ann 下午复检 6 · 拍板第二种）：帖子的图只识一次——发一条独立识图请求拿客观描述，
    // 描述缓存进 post.imageCaption；之后生成评论只附描述文本，不再整图重复送（图帖每搅动一次烧一次识图 token）。
    // 模型选择同下面 buildSparkFetchInit 的规矩：独立识图 API 优先，没设置就用 Spark 全局模型。
    // 单次请求禁重试：失败即失败，调用方直接降级回「原样附图」老路。
    const describeSparkImage = async (imageUrl: string, signal?: AbortSignal): Promise<string> => {
        let api = sparkApi;
        const vision = apiConfig.visionApi;
        if (vision?.enabled && vision.baseUrl && vision.apiKey && vision.model) {
            api = { baseUrl: vision.baseUrl, apiKey: vision.apiKey, model: vision.model } as typeof sparkApi;
        }
        const res = await fetch(`${api.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.apiKey}` },
            body: JSON.stringify({
                model: api.model,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: '用一两句话客观描述这张图的内容' },
                        { type: 'image_url', image_url: { url: imageUrl } },
                    ],
                }],
                temperature: 0.3,
            }),
            signal,
            __sullyMeta: { appId: 'social', appName: 'Spark', purpose: '识图缓存' },
        } as RequestInit);
        if (!res.ok) throw new Error(await apiErrorMessage(res));
        const data = await safeResponseJson(res);
        return String(extractContent(data) || '').trim();
    };

    // 五修-5：识图请求构造——帖子带用户上传图时，把图读出来附进请求。
    // 模型选择（Ann 定稿）：设置了「独立识图 API」→ 用它；没设置 → 直接用 Spark 全局模型发图（多模态模型直接吃）。
    const buildSparkFetchInit = async (
        context: string,
        prompt: string,
        post: SocialPost | null,
        opts: { temperature?: number; maxTokens?: number; purpose: string; signal?: AbortSignal },
    ): Promise<RequestInit & { url: string }> => {
        let api = sparkApi;
        let userContent: any = prompt;
        if (post) {
            const imageRefs = (post.images || []).filter((v): v is string => typeof v === 'string' && v.startsWith('sparkimg:'));
            // 九改-b：原附注句一字不动保留——已识图时跟描述文本一起附
            const attachNote = '（附注：这条帖子带了用户上传的图片，已附在消息里。评论可以自然地聊到图里的内容，也可以不提。）';
            if (imageRefs.length && post.imageCaption) {
                // 识过了：不再附图，只把缓存的描述文本附在 prompt 后面
                userContent = `${prompt}\n\n${attachNote}\n[图片内容：${post.imageCaption}]`;
            } else if (imageRefs.length) {
                const imageDataUrls: string[] = [];
                for (const ref of imageRefs) {
                    try {
                        const data = await DB.getAsset(ref.slice('sparkimg:'.length));
                        if (data) imageDataUrls.push(data);
                    } catch {}
                }
                if (imageDataUrls.length) {
                    // 首次：先独立识一次图，描述落进帖子缓存（走 updatePostInFeed 落库）
                    let caption = '';
                    try { caption = await describeSparkImage(imageDataUrls[0], opts.signal); } catch { caption = ''; }
                    if (caption) {
                        updatePostInFeed(post.id, current => ({ ...current, imageCaption: caption }));
                        userContent = `${prompt}\n\n${attachNote}\n[图片内容：${caption}]`;
                    } else {
                        // 识图失败/空描述 → 不阻塞，降级回老路：原样把图附进去
                        const vision = apiConfig.visionApi;
                        if (vision?.enabled && vision.baseUrl && vision.apiKey && vision.model) {
                            api = { baseUrl: vision.baseUrl, apiKey: vision.apiKey, model: vision.model } as typeof sparkApi;
                        }
                        userContent = [
                            { type: 'text', text: `${prompt}\n\n${attachNote}` },
                            ...imageDataUrls.map(url => ({ type: 'image_url', image_url: { url } })),
                        ];
                    }
                }
            }
        }
        return {
            url: `${api.baseUrl.replace(/\/+$/, '')}/chat/completions`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.apiKey}` },
            body: JSON.stringify({
                model: api.model,
                messages: [{ role: 'system', content: context }, { role: 'user', content: userContent }],
                temperature: opts.temperature ?? 0.8,
                ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
            }),
            signal: opts.signal,
            __sullyMeta: { appId: 'social', appName: 'Spark', purpose: opts.purpose },
        } as RequestInit & { url: string };
    };

    // 五修-1 核心演化（替换原 generateRepliesToUser 的"立刻回复"语义）：
    // 让模型自由决定谁冒泡、回几条、挂在哪——用户的最近评论只是评论区的一部分信息，不是强制任务。
    const evolveCommentSection = async (post: SocialPost, controller: AbortController) => {
        try {
            // spark-follow 2-E：同首评——关注帖不带圈子世界观（脏数据忽略）；其余帖子按原逻辑解析圈子
            const postCircle = post.origin === 'moments'
                ? undefined
                : (post.worldCircleId
                    ? circles.find(c => c.id === post.worldCircleId)
                    : (post.authorType !== 'user' && post.circleId ? circles.find(c => c.id === post.circleId) : undefined));
            // spark-follow 2-E：同首评——候选池统一走 sparkCommentCandidatePool（关注帖=作者+可见；其余=原三步构造）
            const candidatePool = sparkCommentCandidatePool(post, characters, circles, loadTrackedSparkPosts()[post.id]?.charIds || []);
            const selectedChars = selectSparkParticipants(post, [...candidatePool].sort(() => 0.5 - Math.random()), characterHandles);
            // 强制只挂本轮 @：评论 @ 用这一搅；发帖 @ 若还没用过也算这一轮。楼中楼不强制。
            const commentMentionIds = (lastUserCommentRef.current?.postId === post.id && Array.isArray(lastUserCommentRef.current.mentionedCharIds))
                ? lastUserCommentRef.current.mentionedCharIds : [];
            const unusedPostMentions = unusedPostMentionIds(post);
            const mentionIds = mergeSparkMentionIds(commentMentionIds, unusedPostMentions);
            const forcedChars = mentionIds
                .map(id => characters.find(c => c.id === id))
                .filter((c): c is NonNullable<typeof c> => !!c && !selectedChars.some(s => s.id === c.id));
            const finalChars = [...selectedChars, ...forcedChars];
            const context = await buildGenerationContext(finalChars, postCircle);

            // 用户最近有没有在这帖下留言（含楼中楼）——有则作为背景信息告诉模型，由它决定接不接话
            const recent = lastUserCommentRef.current?.postId === post.id ? lastUserCommentRef.current : null;
            // 定稿（2026-09-16 凌晨）：只陈述事实——用户发了什么、是不是楼中楼；怎么接交给角色当下，不带许可句
            // spark-follow 返工：楼中楼要写出本轮回复的是哪条、哪个人，避免 B 把给 A 的话当成对自己说的
            const recentReplyTarget = recent?.repliedToCommentId
                ? (post.comments || []).find(c => c.id === recent.repliedToCommentId)
                : undefined;
            const recentLine = recent
                ? `\n**用户「${socialProfile.name}」最近在评论区发的评论**: \"${recent.content}\"${recentReplyTarget
                    ? `（本轮是在回复「${recentReplyTarget.authorName}」的那条评论，不是在对评论区所有人说话）`
                    : '（本轮是直接评论这条帖子，不是在回复某个人）'}`
                : '';
            let mentionLine = '';
            if (commentMentionIds.length) {
                const replyToName = (() => {
                    const rid = lastUserCommentRef.current?.repliedToCommentId;
                    const target = rid ? (post.comments || []).find(c => c.id === rid) : undefined;
                    return target?.authorName;
                })();
                const mentionedNames = commentMentionIds
                    .map(id => characters.find(c => c.id === id))
                    .filter(Boolean)
                    .map(c => (characterHandles[c!.id] || [])[0]?.handle || c!.name);
                mentionLine = `\n**用户在这条评论里 @ 了 ${mentionedNames.join('、')}**${replyToName ? `——Ta 在回复 ${replyToName}，想看被 @ 的人和 ${replyToName} 就这个话题交流` : '——Ta 想看被 @ 的人来接这条线'}`;
            }
            const lastComment = lastUserCommentRef.current?.postId === post.id;
            const namedSection = commentMentionIds.length
                ? `## 用户点名的角色
用户在这条评论里 @ 到的角色：**这条评论 Ta 看到了。Ta 怎么回应由人设决定，但必须回这条评论，不会像没看见一样。**

`
                : unusedPostMentions.length
                ? `## 用户点名的角色
用户发布这条笔记时 @ 到的角色：**这条笔记 Ta 收到了。Ta 怎么回应由人设决定，但这一轮必须出现，不会像没看见一样。**

`
                : '';

            // v8d 任务 4e（Ann 2026-09-17 定稿口径）：私聊能力只跟着「同步」走——@ 同步和右下角按钮同步
            // 都会把角色写进 loadTrackedSparkPosts()[post.id].charIds；**只要追踪名单里至少有一个人，
            // 私聊节就出现**，用不用交给 AI 看上下文和帖子决定。旧写法要求「同步过的角色恰好在本轮名单里」，
            // 被同步的角色没被抽进本轮 → 整段私聊提示词消失 → 私聊全灭。私聊节正文一字未动。
            const syncedIds = loadTrackedSparkPosts()[post.id]?.charIds || [];
            const privateChatSection = syncedIds.length > 0 ? `### 私聊
角色有可以私聊用户的能力，可以用 "privateChat": ["内容1", "内容2"] 把想对用户一个人说的话直接发进
角色和用户的私聊——只有用户看得到，评论区不显示。
它承载的是只想让用户一个人听到的话：悄悄话、贴脸的话、想避开评论区认真聊几句的。
要不要私聊、什么时候私聊、说几条，跟在评论区发言一样——按角色当下的想法判断。
私聊的节奏跟着用户走：如果Ta 只是在帖子活动、有还没拿主意的事，不要急着替 Ta 做决定或把事情推进下去。
发私聊前先翻最近的私聊记录：你已经发过的内容，不要再重复发。

` : '';

            // 定稿（2026-09-16 凌晨）：搅动=评论区过一段时间的样子——主力是已有的人，新路人偶尔才有
            // spark-follow 2-E：关注帖整段换附录 C（逐字照抄；私聊节按追踪名单开关插入；点名节只认评论 @，
            // 关注没有发帖 @；${recentLine}${mentionLine} 与现有搅动同一套事实句）。其余帖子现有字符串一个字不改。
            const prompt = post.origin === 'moments'
                ? `### 任务: 模拟这条关注动态评论区"过一段时间"之后的样子
**帖子楼主**: ${post.authorName}
**帖子标题**: "${post.title}"
**帖子正文**:
"""
${post.content || '(楼主没写正文)'}
"""
**当前评论区**（每一行都是已经发生过的事实——谁说过什么都在里面）:
${buildSparkCommentHistory(post)}${recentLine}${mentionLine}

你是这条关注动态评论区的群像作者：想象从现在起过了十几分钟到几个小时，评论区里新发生的动静
都由你写出来。这不是公开推荐流，这是楼主发在 Spark 关注上的一条动态。看得见它的人已经在角色名单里。
这个评论区已经有主人了——新动静的主力是**已经在这里的人**：楼主（非用户
发帖情况，不能扮演用户）可能下场补充，评论过的角色和网友接着原来的话头继续聊，之前冒过泡
的路人再冒一句——他们是回到自己参与过的动态，不是初次看见。也可能都散了，重点是看当前
用户和角色最新评论引导的趋向。
**从外面新刷进来的陌生网友是少数**：常常一条都没有，偶尔一两个；真的有，按下面的规矩立人设。
动静的形态：接话、追问、反驳、围观、解释误会、楼主下场补充都行，接着已有讨论往下走；
评论要切实回复有内容的东西，不要说套话；保持每个人前后语气连贯，别都像播报员。
选定角色（用马甲网名发言）出不出场、发几条，根据 Ta 的人格、记忆、之前参与这条动态的内容和当前状态。
尤其是对别人动态的倾诉欲是搁着一层社交面具的。（社交面具：指的是角色想要在关注里保持的形象，并非100%的现实原生性格，而是给别人看的侧面，与角色的人设，性格，心态和需求有关。）

${privateChatSection}### 新刷进来的陌生网友（charId 为 null）：偶尔才有，一条没有是常态
给这个新人立一个具体人设再开口：
- 网名符合现实社交媒体的常见命名习惯（大小写混排、下划线、数字缀、叠词、缩写都行），
  并且符合当前的世界限制规则。
- 身份从设定世界的网民生态里随机取：学生、小孩、上班族、外国人、店主、自由职业者、
  退休老人、深夜冲浪的年轻人……甚至宠物、恶魔、捏捏、代码——只要符合当前世界观。
- 带不同的年龄、职业、说话习惯、此刻刷帖场景（地铁上、睡前、摸鱼中）、
  心情（开心、疑惑、难过、愤世嫉俗、无聊）、需求（正义感、想被治愈、想便宜收东西、
  想请教、想分享）。禁止死板照抄例子。
- 立场和动机各自不同——站在不同位置看这事。
- 信息量有限：能知道的只有这条帖子的标题、正文、配图、tag、评论区已公开的内容、
  帖子上的昵称，和 Ta 自己的人生经验。
- 和用户、和任何角色都是初次刷到的关系，别硬认。
- 路人的评论不一定跟用户与角色相关，由他的视角自然决定：大多数评论就是对着帖子本身说话——就事论事、玩梗、吐槽、科普，跟任何角色和用户都没有关系，不需要挖掘或呼应账号背后的人物与关系

${namedSection}### 禁令
- 绝对禁止生成 author 等于或近似 "${socialProfile.name}"（用户）的评论。
- 新路人的 author 必须是全新的网名，绝对不能与上方【角色身份库】中列出的任何马甲网名重合，
  也不能冒用评论区里已经出现过的路人网名。
- 禁止串记忆：用户和角色的私聊内容、私下关系、彼此称呼、私人物品、私密回忆、私下约定，
  路人一律不知道，不能出现、不能暗示、不能换说法转述；任何角色不得引用、暗示其他角色的
  私聊和私密信息。别的评论里提到的"我对象/我家那位"，默认是 Ta 自己生活里的人，和帖子里的
  其他任何人没有对应关系。
- 禁止复读：如果是贴子里已经有的路人继续发评论，要带着新东西开口——接着自己上一次的话往下走（接话、补充、改口、被说服、抬杠升级、回复别人都可以），不许原地重复或换皮重复自己已经说过的观点；也不机械复读同一个梗。
- 禁止无意义对话：每条评论都言之有物——对帖子或讨论有实际回应；「哈哈哈哈」「太xx了吧」
  「+1」「确实」这类没有信息量的评论一条都不要，不拿纯表情、纯语气词、纯打招呼凑数。
- 评论正文里禁止出现任何 # 话题标记（#xx# 和 #xx 都不行），评论就是纯说话。
- 自检：任何一条评论出现了上面禁止的内容，就地重写这条评论。

### 输出格式 (JSON Array)
[
  { "author": "网名 (Handle) 或路人昵称", "charId": "角色ID或null", "content": "评论内容...", "replyTo": "要回复的已有评论的作者名，顶层新评论填 null", "privateChat": ["想说的第一条", "第二条", ...] 或省略 }
]`
                : `### 任务: 模拟这个帖子评论区"过一段时间"之后的样子
**帖子楼主**: ${post.authorName}
**帖子标题**: "${post.title}"
**帖子正文**:
"""
${post.content || '(楼主没写正文)'}
"""
**当前评论区**（每一行都是已经发生过的事实——谁说过什么都在里面）:
${buildSparkCommentHistory(post)}${recentLine}${mentionLine}

你是这条帖子评论区的群像作者：想象从现在起过了十几分钟到几个小时，评论区里新发生的动静
都由你写出来。这个评论区已经有主人了——新动静的主力是**已经在这里的人**：楼主（非用户
发帖情况，不能扮演用户）可能下场补充，评论过的角色和网友接着原来的话头继续聊，之前冒过泡
的路人再冒一句——他们是回到自己参与过的帖子，不是初次刷到。也可能都散了，重点是看当前
用户和角色最新评论引导的趋向。
**从外面新刷进来的陌生网友是少数**：常常一条都没有，偶尔一两个；真的有，按下面的规矩立人设。
动静的形态：接话、追问、反驳、围观、解释误会、楼主下场补充都行，接着已有讨论往下走；
评论要切实回复有内容的东西，不要说套话；保持每个人前后语气连贯，别都像播报员。
选定角色（用马甲网名发言）出不出场、发几条，根据 Ta 的人格、记忆、之前参与帖子内容和当前状态。
尤其是对网友的倾诉欲是搁着一层社交面具的。（社交面具：指的是角色想要在圈子里保持的形象，并非100%的现实原生性格，而是互联网的侧面的性格，与角色的人设，性格，心态和需求有关。）

${privateChatSection}### 新刷进来的陌生网友（charId 为 null）：偶尔才有，一条没有是常态
给这个新人立一个具体人设再开口：
- 网名符合现实社交媒体的常见命名习惯（大小写混排、下划线、数字缀、叠词、缩写都行），
  并且符合当前的世界限制规则。
- 身份从设定世界的网民生态里随机取：学生、小孩、上班族、外国人、店主、自由职业者、
  退休老人、深夜冲浪的年轻人……甚至宠物、恶魔、捏捏、代码——只要符合当前世界观。
- 带不同的年龄、职业、说话习惯、此刻刷帖场景（地铁上、睡前、摸鱼中）、
  心情（开心、疑惑、难过、愤世嫉俗、无聊）、需求（正义感、想被治愈、想便宜收东西、
  想请教、想分享）。禁止死板照抄例子。
- 立场和动机各自不同——站在不同位置看这事。
- 信息量有限：能知道的只有这条帖子的标题、正文、配图、tag、评论区已公开的内容、
  帖子上的昵称，和 Ta 自己的人生经验。
- 和用户、和任何角色都是初次刷到的关系，别硬认。
- 路人的评论不一定跟用户与角色相关，由他的视角自然决定：大多数评论就是对着帖子本身说话——就事论事、玩梗、吐槽、科普，跟任何角色和用户都没有关系，不需要挖掘或呼应账号背后的人物与关系

${namedSection}### 禁令
- 绝对禁止生成 author 等于或近似 "${socialProfile.name}"（用户）的评论。
- 新路人的 author 必须是全新的网名，绝对不能与上方【角色身份库】中列出的任何马甲网名重合，
  也不能冒用评论区里已经出现过的路人网名。
- 禁止串记忆：用户和角色的私聊内容、私下关系、彼此称呼、私人物品、私密回忆、私下约定，
  路人一律不知道，不能出现、不能暗示、不能换说法转述；任何角色不得引用、暗示其他角色的
  私聊和私密信息。别的评论里提到的"我对象/我家那位"，默认是 Ta 自己生活里的人，和帖子里的
  其他任何人没有对应关系。
- 禁止复读：如果是贴子里已经有的路人继续发评论，要带着新东西开口——接着自己上一次的话往下走（接话、补充、改口、被说服、抬杠升级、回复别人都可以），不许原地重复或换皮重复自己已经说过的观点；也不机械复读同一个梗。
- 禁止无意义对话：每条评论都言之有物——对帖子或讨论有实际回应；「哈哈哈哈」「太xx了吧」
  「+1」「确实」这类没有信息量的评论一条都不要，不拿纯表情、纯语气词、纯打招呼凑数。
- 评论正文里禁止出现任何 # 话题标记（#xx# 和 #xx 都不行），评论就是纯说话。
- 自检：任何一条评论出现了上面禁止的内容，就地重写这条评论。

### 输出格式 (JSON Array)
[
  { "author": "网名 (Handle) 或路人昵称", "charId": "角色ID或null", "content": "评论内容...", "replyTo": "要回复的已有评论的作者名，顶层新评论填 null", "privateChat": ["想说的第一条", "第二条", ...] 或省略 }
]`;
            const init = await buildSparkFetchInit(context, prompt, post, { temperature: 0.9, purpose: lastComment ? '搅动评论区(含用户新评论)' : '搅动评论区', signal: controller.signal });
            const response = await fetch(init.url, init as RequestInit);
            if (!response.ok) throw new Error(await apiErrorMessage(response));
            const data = await safeResponseJson(response);
            if (controller.signal.aborted) return;
            const json = safeParseJSON(extractContent(data));
            if (!Array.isArray(json)) throw new Error('Parsed data is not an array');

            const existing = post.comments || [];
            const newComments: SocialComment[] = [];
            const privateMessages: { charId: string; lines: string[] }[] = [];
            json.forEach((c: any) => {
                const author = resolveSparkAuthor(c, finalChars, candidatePool, characterHandles, [socialProfile.name, userProfile.name]);
                if (!author) return;
                const split = splitSparkCommentItem(c);
                if (!split.publicContent && !split.privateLines.length) return;
                const matchedChar = author.character;
                // 私聊硬闸只挡私聊：没同步 / 开关关 / 路人 → 丢掉私聊，公开评论照常落
                if (split.privateLines.length && canSparkPrivateChat(matchedChar?.id, syncedIds, loadPrivateChatOff())) {
                    privateMessages.push({ charId: matchedChar!.id, lines: split.privateLines });
                }
                if (!split.publicContent) return;
                const avatar = matchedChar ? matchedChar.avatar : sparkStrangerAvatar(author.name);
                const forceCommentId = (matchedChar && commentMentionIds.includes(matchedChar.id))
                    ? lastUserCommentRef.current?.userCommentId
                    : undefined;
                const target = findSparkReplyTarget(c.replyTo, [...existing, ...newComments], {
                    matchedCharId: matchedChar?.id,
                    speakerName: author.name,
                    userNames: [socialProfile.name, userProfile.name],
                    forceCommentId,
                });
                newComments.push({
                    id: `cmt-evo-${Date.now()}-${Math.random()}`,
                    authorName: author.name,
                    authorAvatar: avatar,
                    content: split.publicContent,
                    likes: Math.floor(Math.random() * 10),
                    isCharacter: !!matchedChar,
                    authorType: matchedChar ? 'character' as const : 'stranger' as const,
                    authorCharId: matchedChar?.id,
                    replyToId: target?.id,
                } as SocialComment);
            });
            // 五修-7 + 六改-6：私聊消息落主聊天（角色的普通 assistant 消息，逐条存、贴连发感——
            // 首条带前空行、末条带后空行，中间条不垫空行，读起来像真人一条接一条刷屏）
            // spark-follow 功能 1（1-A）：写库对象/顺序/失败处理原样不动；成功 toast 删掉，
            // 改成收集 followupBatch，循环结束后一次接进弹窗队列（微信条替代）。
            const followupBatch: { charId: string; name: string; avatar: string; firstLine: string }[] = [];
            for (const pm of privateMessages) {
                try {
                    const char = characters.find(c => c.id === pm.charId);
                    const avatar = resolveSparkCharAvatar(pm.charId, char?.avatar, char?.name || '');
                    const name = char?.name || '角色';
                    for (let i = 0; i < pm.lines.length; i++) {
                        const wrapped = `${i === 0 ? '\n' : ''}${pm.lines[i]}${i === pm.lines.length - 1 ? '\n' : ''}`;
                        await DB.saveMessage({ charId: pm.charId, role: 'assistant', type: 'text', content: wrapped });
                        const line = (pm.lines[i] || '').trim();
                        if (line) followupBatch.push({ charId: pm.charId, name, avatar, firstLine: line });
                    }
                    trackEvent('Spark 搅动产生私聊消息');
                } catch (e) {
                    console.warn('[Spark] 搅动私聊落库失败', { charId: pm.charId, e });
                    addToast('私聊没能写进聊天', 'error');
                }
            }
            if (followupBatch.length) setFollowupQueue(queue => [...queue, ...followupBatch]);
            const merged = updatePostInFeed(post.id, current => ({
                ...current,
                comments: mergeSocialComments(current.comments || [], newComments),
            }));
            const added = (merged?.comments?.length ?? existing.length) - existing.length;
            if (added > 0) {
                addToast(`评论区有 ${added} 条新动静`, 'info');
            } else if (privateMessages.length) {
                // 私聊 toast 已在上面逐条说过
            } else if (json.length > 0) {
                addToast('模型回了内容，但没能写进评论区', 'error');
            } else {
                addToast('这段时间评论区没什么动静', 'info');
            }
            if (unusedPostMentions.length) {
                updatePostInFeed(post.id, current => ({ ...current, mentionForceUsed: true }));
            }
            // 搅动过后清掉"用户刚评论"的记忆——再搅动就是普通的时间流逝
            if (lastUserCommentRef.current?.postId === post.id) lastUserCommentRef.current = null;
        } catch (e: any) {
            if (e?.name !== 'AbortError') addToast(`评论区模拟失败: ${e?.message || e}`, 'error');
        }
    };

    // v9 四修（Ann 复检命中）：已读水位初始化——**所有**打开帖子的入口都必须走这里。
    // 私聊卡片跳帖曾绕过它 → 内存水位为空 → 全部回复算没看过 → 冒红点。
    const initReplyWatermarks = (post: SocialPost) => {
        seenRepliesRef.current = {};
        const all = loadSparkReplyWatermarks();
        const saved = all[post.id] || {};
        const byId = new Map(post.comments.map(c => [c.id, c]));
        const rootCounts: Record<string, number> = {};
        for (const c of post.comments) {
            let cur = c; const seen = new Set<string>();
            while (cur.replyToId && !seen.has(cur.id)) { seen.add(cur.id); const p = byId.get(cur.replyToId); if (!p) break; cur = p; }
            // v9 三修：守门条件必须用原始评论 c —— cur 已挪到根，根无 replyToId，旧写法永假＝死代码
            if (c.replyToId) rootCounts[cur.id] = (rootCounts[cur.id] || 0) + 1;
        }
        for (const [rootId, count] of Object.entries(rootCounts)) {
            if (typeof saved[rootId] === 'number') {
                seenRepliesRef.current[rootId] = saved[rootId];
            } else {
                seenRepliesRef.current[rootId] = count;
                saveSparkReplyWatermark(post.id, rootId, count);
            }
        }
    };

    // spark-follow 任务 1-C：点条 → 清定时器、清空队列（后面的不再演）、清当前条，跳进该角色私聊
    const handleFollowupClick = (item: { charId: string; name: string; avatar: string; firstLine: string }) => {
        if (followupTimerRef.current != null) { window.clearTimeout(followupTimerRef.current); followupTimerRef.current = null; }
        setFollowupQueue([]);
        setCurrentFollowup(null);
        setActiveCharacterId(item.charId);
        openApp(AppID.Chat);
    };

    const handleOpenPost = (post: SocialPost) => {
        const livePost = feedRef.current.find(item => item.id === post.id) || post;
        // 评论不自动生成（省 token）：打开详情只展示已有评论，空时由用户手动点「加载评论」
        setSelectedPost(livePost);
        // v9 二轮（Ann 拍板 B 案）：已读水位 localStorage 持久化——点开看过永久消失，退出重进不复发。
        // 打开时：已有记录的楼层沿用旧水位（打开期间新长出的回复才冒点）；无记录的楼层记当前数（打开前的不算新）。
        initReplyWatermarks(livePost);
        // spark-follow 功能 1：打开帖子不补弹——顺手清掉残留的条（没有新写入就没有条）
        if (followupTimerRef.current != null) { window.clearTimeout(followupTimerRef.current); followupTimerRef.current = null; }
        setFollowupQueue([]);
        setCurrentFollowup(null);
    };

    const handleClosePost = () => {
        commentRequestRef.current?.controller.abort();
        commentRequestRef.current = null;
        setLoadingComments(false);
        setSelectedPost(null);
        setReplyTarget(null);
        setEditingComment(null); // 八改：切帖/关帖防悬空编辑态
        setCommentInput('');
        // 七改-UI：弹层与楼中楼折叠状态一并复位（下次打开是干净的默认态）
        setComposerOpen(false);
        setExpandedReplyGroups({});
        seenRepliesRef.current = {};
        // spark-follow 功能 1：关帖清掉私聊条（队列、当前条、定时器全清）
        if (followupTimerRef.current != null) { window.clearTimeout(followupTimerRef.current); followupTimerRef.current = null; }
        setFollowupQueue([]);
        setCurrentFollowup(null);
    };

    // 七改-UI：评论输入弹层的开合（xhs 手感：升起 0.34s，180ms 后聚焦防滚动跑偏）
    const openComposer = () => {
        setComposerOpen(true);
        setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 180);
    };
    const closeComposer = () => {
        setComposerOpen(false);
        composerRef.current?.blur();
        // 六改-2b：收起弹层复位 @ 选择（没发出去的 mention 不保留）
        setComposerMentionOpen(false);
        setCommentMentions([]);
        // 八改：弹层收起复位原位编辑态（防悬空编辑）
        setEditingComment(null);
    };
    // 桌面端 Esc 收起弹层
    useEffect(() => {
        if (!composerOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeComposer(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [composerOpen]);

    const handleClearFeed = () => {
        refreshRequestRef.current?.abort();
        commentRequestRef.current?.controller.abort();
        replyRequestRef.current?.controller.abort();
        refreshRequestRef.current = null;
        commentRequestRef.current = null;
        replyRequestRef.current = null;
        setIsRefreshing(false);
        setLoadingComments(false);
        setIsReplyingToUser(false);
        // spark-follow 2-D（Ann 2026-09-17）：清空只删发现里的帖——用户笔记、关注帖（moments）留下。
        // 用户笔记判定与「我的」页同口径（含旧版无 authorType 的本人帖）。
        const isUserNote = (p: SocialPost) => p.authorType === 'user' || (!p.authorType && p.authorName === socialProfile.name);
        const doomedIds = new Set(feedRef.current.filter(p => !isUserNote(p) && p.origin !== 'moments').map(p => p.id));
        feedRef.current = feedRef.current.filter(p => !doomedIds.has(p.id));
        setFeed(feedRef.current);
        setSelectedPost(null);
        // 逐帖删除，不再调 DB.clearSocialPosts（那会把笔记和关注帖一起端走）
        for (const id of doomedIds) DB.deleteSocialPost(id);
        // 追踪名单只删被删帖的条目，不一把清空——关注帖/笔记的追踪保留
        try {
            const tracked = loadTrackedSparkPosts();
            for (const id of doomedIds) delete tracked[id];
            saveTrackedSparkPosts(tracked);
        } catch {}
        setShowSettings(false);
        addToast('推荐流已清空', 'success');
        trackEvent('清空 Spark 推荐流');
    };

    // --- Renderers ---

    // 五修-5：Spark 帖子媒体渲染——`sparkimg:` 前缀 = 用户上传图（从 assets 取，引用丢失时占位）；
    // 其他值 = emoji 贴纸（沿用原大字渲染）
    const renderPostMedia = (value: string, emojiClass: string, imgClass?: string) => {
        if (typeof value === 'string' && value.startsWith('sparkimg:')) {
            return <SparkPostImage assetId={value.slice('sparkimg:'.length)} imgClassName={imgClass || emojiClass} emojiClass={emojiClass} />;
        }
        return <div className={emojiClass}>{codepointToEmoji(value)}</div>;
    };

    // 1. Feed Item (Glassmorphism)
    // spark-follow 2-C/2-H：opts.hideDelete = 关注页复用本卡片时藏掉自带 ×（编辑/删除由关注页自己的角标负责，删除要多断开追踪）；
    // images 为空（关注帖没图）时不渲染媒体，只留 bgStyle 空白底——不塞 ✨ 冒充有图
    const renderFeedItem = (post: SocialPost, opts?: { hideDelete?: boolean }) => (
        <div key={post.id} onClick={() => handleOpenPost(post)} className="break-inside-avoid mb-3 bg-white/70 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer active:scale-[0.98] border border-white/50 relative group">
            <div className="aspect-[4/5] w-full flex items-center justify-center relative overflow-hidden" style={{ background: post.bgStyle }}>
                {/* Decorative Overlay for "Premium" look */}
                <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]"></div>
                {post.images.length > 0 && renderPostMedia(post.images[0], 'text-6xl drop-shadow-xl filter saturate-150 transform transition-transform group-hover:scale-110 duration-500', 'w-full h-full object-cover')}
                {post.title && (
                    <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/50 via-black/20 to-transparent">
                        <h3 className="text-white font-bold text-sm line-clamp-2 drop-shadow-md leading-tight">{post.title}</h3>
                    </div>
                )}
            </div>
            <div className="p-3">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 min-w-0">
                        <TokenImg value={resolveSparkCharAvatar(post.authorCharId, post.authorAvatar, post.authorName)} className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-white/50" />
                        <span className="text-[11px] text-slate-700 truncate font-medium">{post.authorName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-600 transition-colors">
                        <Icons.Heart filled={post.isLiked} className="w-4 h-4" onClick={(e) => handleLike(e, post)} />
                        <span className="text-[10px] font-medium whitespace-nowrap">{fmtCount(post.likes)}</span>
                    </div>
                </div>
            </div>
            {!opts?.hideDelete && <button onClick={(e) => { e.stopPropagation(); handleDeletePost(post.id); }} className="absolute top-2 right-2 z-20 w-6 h-6 bg-black/20 text-white rounded-full flex items-center justify-center text-xs backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80">×</button>}
        </div>
    );

    // 2. Detail Overlay (Glassmorphism)
    // FIX: Using a fixed container for backdrop to prevent layout gaps.
    // REMOVED 'key={selectedPost.id}' to prevent re-mounting jitter.
    // SEPARATED scrollable container from animation wrapper.
    const renderDetail = () => {
        if (!selectedPost) return null;
        return (
            <div
                className="absolute inset-0 z-[60] h-full w-full bg-white/90 backdrop-blur-xl flex flex-col"
            >
                {/* 七改-UI：楼中楼展开动画（xhs 参考：0.24s 淡入 + 上浮 4px，缓动 cubic-bezier(.16,1,.3,1)） */}
                <style>{`@keyframes sparkRepliesIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}.spark-replies-in{animation:sparkRepliesIn .24s cubic-bezier(.16,1,.3,1) both}`}</style>
                {/* spark-follow 任务 1-B：私聊弹窗条 —— 微信式白底横条，贴顶滑入，整条可点。
                    只画在详情页；白底浅灰边 shadow-sm，不用共享 Modal、没有按钮文字/声音/振动/图标 emoji。 */}
                <style>{`@keyframes sparkFollowupIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}.spark-followup-in{animation:sparkFollowupIn .26s cubic-bezier(.16,1,.3,1) both}`}</style>
                {currentFollowup && (
                    <button
                        onClick={() => handleFollowupClick(currentFollowup)}
                        className="spark-followup-in absolute left-3 right-3 z-[80] flex items-center gap-2.5 bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-2.5 text-left active:scale-[0.98] transition-transform"
                        style={{ top: 'var(--safe-top)' }}
                    >
                        <TokenImg value={currentFollowup.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-800 truncate">{currentFollowup.name}</span>
                            <span className="block text-xs text-slate-500 truncate">{currentFollowup.firstLine}</span>
                        </span>
                    </button>
                )}
                {/* 
                   Animation Wrapper. 
                   We want the whole overlay content to slide up. 
                   We ensure this doesn't re-render on state changes like comments.
                */}
                <div className="flex-1 w-full h-full flex flex-col animate-slide-up relative overflow-hidden">
                    {/* Header —— 自理安全区：--safe-top 让开刘海（带 iOS env 偶发返回 0 的 JS 兜底；非刘海设备保底 12px） */}
                    <div className="flex items-center justify-between px-4 bg-white/60 backdrop-blur-xl border-b border-white/20 shrink-0 relative z-20" style={{ paddingTop: 'max(12px, var(--safe-top))', paddingBottom: '12px' }}>
                        <button onClick={handleClosePost} className="p-2 -m-2 active:opacity-60"><Icons.Back /></button>
                        <div className="flex items-center gap-2">
                            <TokenImg value={resolveSparkCharAvatar(selectedPost.authorCharId, selectedPost.authorAvatar, selectedPost.authorName)} className="w-8 h-8 rounded-full object-cover border border-white/50" />
                            <span className="text-sm font-bold text-slate-800">{selectedPost.authorName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* v9（Ann 拍板）：右上角只有分享；同步星住底部互动栏（原收藏星外观，功能换成同步+追踪） */}
                            <button onClick={() => { setShowShareModal(true); trackEvent('打开分享帖子面板'); }} className="p-2 -m-2 active:opacity-60"><Icons.Share className="w-6 h-6 text-slate-800 cursor-pointer hover:text-[#ff2442]" /></button>
                        </div>
                    </div>

                    {/* Scrollable Area */}
                    <div ref={detailScrollRef} className="flex-1 overflow-y-auto no-scrollbar pb-24">
                        {/* Main Visual —— 五修-5：多图支持（图片帖渲染图片列表，emoji 帖保持原大字） */}
                        <div className="w-full aspect-square flex flex-col items-center justify-center text-[8rem] relative overflow-hidden" style={{ background: selectedPost.bgStyle }}>
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10"></div>
                            {selectedPost.images.some(v => typeof v === 'string' && v.startsWith('sparkimg:')) ? (
                                <div className="relative z-10 w-full h-full flex gap-0.5 overflow-x-auto no-scrollbar snap-x">
                                    {selectedPost.images.map((v, i) => (
                                        <div key={i} className="w-full h-full shrink-0 snap-center flex items-center justify-center">
                                            {renderPostMedia(v, 'text-[8rem] drop-shadow-2xl filter saturate-125', 'max-w-full max-h-full object-contain')}
                                        </div>
                                    ))}
                                </div>
                            ) : selectedPost.images[0] !== undefined ? (
                                <div className="relative z-10 drop-shadow-2xl filter saturate-125">{codepointToEmoji(selectedPost.images[0])}</div>
                            ) : null}
                        </div>

                        <div className="p-6 space-y-4">
                            <h1 className="text-2xl font-black text-slate-900 leading-snug tracking-tight">{selectedPost.title}</h1>
                            <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap font-light">{displayContent(selectedPost.content)}</p>

                            <div className="flex gap-2 flex-wrap pt-2">
                                {selectedPost.tags.map(t => <span key={t} className="text-xs font-bold text-blue-600 bg-blue-50/50 backdrop-blur-sm border border-blue-100 px-2.5 py-1 rounded-full">#{t.replace(/^#+/, '')}</span>)}
                            </div>
                            <div className="text-xs text-slate-400 font-medium border-b border-slate-100/50 pb-6">{new Date(selectedPost.timestamp).toLocaleDateString()}</div>
                        </div>

                        {/* Comments Section —— 七改-UI：xhs 复刻（吸顶小节头 / 无竖线 meta / 楼中楼默认折叠+48px 缩进） */}
                        <div className="px-4 pb-6">
                            <div className="sticky top-0 z-10 -mx-4 px-4 h-[52px] flex items-center gap-2 bg-white/95 backdrop-blur-sm">
                                <span className="text-[17px] font-semibold tracking-[-0.01em] text-[#1A1A1A]">共 {selectedPost.comments.length} 条评论</span>
                                {(loadingComments || isReplyingToUser) && <div className="w-3 h-3 border-2 border-slate-200 border-t-[#ff2442] rounded-full animate-spin"></div>}
                            </div>

                            {selectedPost.comments.length === 0 && !loadingComments && (
                                <button onClick={() => generateComments(selectedPost)} className="w-full py-6 text-center text-[13.5px] text-[#9A9A9A]">
                                    <span className="inline-block px-5 py-1.5 rounded-full bg-[#F5F5F5] active:bg-[#ECECEC] transition-colors">点击加载评论</span>
                                </button>
                            )}
                            {(() => {
                                // 楼中楼渲染（七改-UI，xhs 复刻版）：
                                //  - 根评论 38px 头像；子回复统一缩进 48px、26px 头像（参考文档唯一规则，无两套缩进）
                                //  - 回复楼中楼里的评论：按「挂在谁下面」DFS 排序，紧贴被回复的那条下方 + 「回复 @xx」标签
                                //  - 默认折叠；「展开 N 条回复 ↔ 收起回复」；展开 0.24s 淡入，收起全折一条不留
                                const comments = selectedPost.comments;
                                const byId = new Map(comments.map(c => [c.id, c]));
                                const findRoot = (c: SocialComment): SocialComment | null => {
                                    let cur = c;
                                    const seen = new Set<string>();
                                    while (cur.replyToId && !seen.has(cur.id)) {
                                        seen.add(cur.id);
                                        const parent = byId.get(cur.replyToId);
                                        if (!parent) return null; // 指向已不存在的评论 → 孤儿，平铺兜底
                                        cur = parent;
                                    }
                                    return cur.replyToId ? null : cur;
                                };
                                const roots = comments.filter(c => { const r = findRoot(c); return r === c || r === null; });
                                // DFS：每条子回复直接排在它回复的那条评论后面（Ann：紧贴在被回复评论下面）
                                const orderedRepliesOf = (root: SocialComment): SocialComment[] => {
                                    const out: SocialComment[] = [];
                                    const walk = (parentId: string) => {
                                        for (const c of comments) {
                                            if (c.replyToId === parentId) { out.push(c); walk(c.id); }
                                        }
                                    };
                                    walk(root.id);
                                    return out;
                                };
                                const renderBody = (c: SocialComment, isChild: boolean, replyToName?: string) => (
                                    <div className="flex gap-[10px]">
                                        <TokenImg value={resolveSparkCharAvatar(c.authorCharId, c.authorAvatar, c.authorName)} className={`${isChild ? 'w-[26px] h-[26px]' : 'w-[38px] h-[38px]'} rounded-full object-cover shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                <span className={`text-[13px] leading-[1.3] ${c.isCharacter ? 'text-[#1A1A1A] font-medium' : 'text-[#7A7A7A]'}`}>{c.authorName}</span>
                                                {replyToName && <span className="text-[11px] leading-[1.3] text-[#9A9A9A]">回复 <span className="font-medium">@{replyToName}</span></span>}
                                            </div>
                                            {editingComment?.id === c.id ? (
                                                // 八改（Ann 复检反馈3）：原位编辑态——textarea 贴评论弹层输入框基调
                                                <div className="mt-[4px]">
                                                    <textarea
                                                        value={editingComment.draft}
                                                        onChange={(e) => setEditingComment(prev => prev && prev.id === c.id ? { ...prev, draft: e.target.value } : prev)}
                                                        className="border border-[#EDEDED] rounded-[12px] text-[15px] p-2 caret-[#FF2442] bg-white w-full resize-none outline-none"
                                                        rows={Math.min(6, Math.max(2, editingComment.draft.split('\n').length))}
                                                    />
                                                    <div className="mt-[6px] flex items-center gap-2">
                                                        <button
                                                            onClick={() => saveEditingComment(selectedPost)}
                                                            className="px-3 py-[3px] rounded-full bg-[#FF2442] text-white text-[11px] active:opacity-70"
                                                        >保存</button>
                                                        <button
                                                            onClick={() => setEditingComment(null)}
                                                            className="px-3 py-[3px] rounded-full border border-[#E5E5E5] text-[#7A7A7A] text-[11px] active:opacity-60"
                                                        >取消</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="mt-[4px] text-[14px] leading-[1.5] text-[#1A1A1A] break-words">{displayContent(c.content)}</p>
                                            )}
                                            {/* meta 行：无竖线，只用间隙分隔；右侧心形+赞数（15px，可点赞） */}
                                            {/* 五修-2：任何评论都可管理（删/改）——手机端无 hover，按钮常显但低调 */}
                                            <div className="mt-[6px] flex items-center gap-4">
                                                <button onClick={() => { setReplyTarget(c); openComposer(); }} className="text-[11px] text-[#9A9A9A] active:opacity-60">回复</button>
                                                <button onClick={() => setEditingComment({ id: c.id, draft: c.content })} className="text-[11px] text-[#C4C4C4] active:opacity-60">编辑</button>
                                                <button onClick={() => { setDeleteConfirm({ post: selectedPost, comment: c }); setDeleteNotify(false); }} className="text-[11px] text-[#C4C4C4] active:opacity-60">删除</button>
                                                <div className="ml-auto flex items-center gap-[5px] text-[#C4C4C4]">
                                                    <Icons.Heart
                                                        filled={!!c.isLiked}
                                                        onClick={() => handleLikeComment(selectedPost, c)}
                                                        className="w-[15px] h-[15px]"
                                                    />
                                                    <span className="text-[10px]">{c.likes}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                                return roots.map(root => {
                                    const replies = orderedRepliesOf(root);
                                    const expanded = !!expandedReplyGroups[root.id];
                                    const toggleReplies = () => {
                                        // v9 二轮：展开即写已读水位（内存 + localStorage 持久化）——小红点一次性，点开看过永久消失
                                        if (!expanded) {
                                            seenRepliesRef.current[root.id] = replies.length;
                                            saveSparkReplyWatermark(selectedPost.id, root.id, replies.length);
                                        }
                                        setExpandedReplyGroups(prev => ({ ...prev, [root.id]: !prev[root.id] }));
                                    };
                                    // 展开状态下有新回复进来 → 直接视为已读（都在眼皮底下了）
                                    if (expanded && seenRepliesRef.current[root.id] !== replies.length) {
                                        seenRepliesRef.current[root.id] = replies.length;
                                        saveSparkReplyWatermark(selectedPost.id, root.id, replies.length);
                                    }
                                    // 水位之上 = 刷新/搅动带来的新回复（未读过）；无记录 = 打开后新长出来的楼层，回复全是新的
                                    const newReplies = replies.length - (seenRepliesRef.current[root.id] ?? 0);
                                    return (
                                        <div key={root.id} className="pt-[14px]">
                                            {renderBody(root, false)}
                                            {replies.length > 0 && !expanded && (
                                                <div className="flex items-center gap-2 mt-[12px] ml-[38px]">
                                                    <button onClick={toggleReplies} className="flex items-center gap-[10px] text-[12px] text-[#9A9A9A] active:opacity-60 transition-opacity">
                                                        <span className="w-[22px] h-px bg-[#DCDCDC] shrink-0"></span>
                                                        展开{replies.length}条回复
                                                    </button>
                                                    {/* v9 二轮（Ann 拍板 B 案）：低调小红点替代红底胶囊——有新回复才亮 */}
                                                    {newReplies > 0 && (
                                                        <span className="w-[7px] h-[7px] rounded-full bg-[#FF2442] animate-fade-in shrink-0" title={`${newReplies}条新回复`}></span>
                                                    )}
                                                </div>
                                            )}
                                            {replies.length > 0 && expanded && (
                                                <div>
                                                    <div className="spark-replies-in">
                                                        {replies.map(child => {
                                                            // 直接回复根评论不显示标签；回复楼层里的其他人显示「回复 @xx」
                                                            const direct = child.replyToId ? byId.get(child.replyToId) : undefined;
                                                            return (
                                                                <div key={child.id} className="mt-[14px] ml-[48px]">
                                                                    {renderBody(child, true, direct && direct.id !== root.id ? direct.authorName : undefined)}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <button onClick={toggleReplies} className="flex items-center gap-[10px] mt-[12px] ml-[38px] text-[12px] text-[#9A9A9A] active:opacity-60 transition-opacity">
                                                        <span className="w-[22px] h-px bg-[#DCDCDC] shrink-0"></span>
                                                        收起回复
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                            <div ref={commentsEndRef} />
                        </div>
                    </div>

                    {/* Bottom Notebar —— 七改-UI：xhs 吸底互动栏（「说点什么…」胶囊 + 点赞/收藏），点胶囊升起输入弹层 */}
                    <div className="absolute bottom-0 w-full z-30 bg-white border-t border-black/[0.03] pb-[var(--safe-bottom,0px)]">
                        <div className="h-[56px] px-[14px] flex items-center gap-[14px]">
                            <button
                                onClick={openComposer}
                                className="flex-1 h-[38px] rounded-full bg-[#F2F2F2] px-[14px] flex items-center gap-2 text-left active:bg-[#ECECEC] transition-colors"
                            >
                                <Icons.Pencil className="w-[15px] h-[15px] text-[#B9B9B9] shrink-0" />
                                <span className="text-[14px] text-[#B9B9B9] truncate">说点什么…</span>
                            </button>
                            {/* v9 二轮（Ann 参考图）：图标左、数字右水平排列；星 = 同步星（功能原样：点击开「让角色知道」，追踪中点亮琥珀），披收藏外观 + 稳定随机装饰数字 */}
                            <div className="flex items-center gap-[20px] shrink-0 text-[#3A3A3A]">
                                <div className="flex items-center gap-[6px] shrink-0">
                                    <Icons.Heart filled={selectedPost.isLiked} onClick={(e) => handleLike(e, selectedPost)} className="w-[24px] h-[24px]" />
                                    <span className="text-[13.5px] font-medium whitespace-nowrap">{fmtCount(selectedPost.likes)}</span>
                                </div>
                                <button
                                    onClick={() => { setShowSyncModal(true); trackEvent('打开同步 Spark 动态面板'); }}
                                    className="flex items-center gap-[6px] shrink-0 active:opacity-60"
                                    title="让角色知道（同步）"
                                >
                                    <Icons.Star filled={!!loadTrackedSparkPosts()[selectedPost.id]?.charIds?.length} className="w-[24px] h-[24px]" />
                                    {/* v9 三修（Ann）：同步成功装饰数字 +1，断开回落；k+/w+ 档不体现加一 */}
                                    <span className="text-[13.5px] font-medium whitespace-nowrap">{(() => { const base = decoCollectNum(selectedPost.id); const tracked = !!loadTrackedSparkPosts()[selectedPost.id]?.charIds?.length; return fmtCount(base >= 1000 ? base : (tracked ? base + 1 : base)); })()}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 九改-3（Ann 复检反馈3）：删除评论确认弹层（小红书风格：白底圆角卡 / 居中标题 / 底部两键 / 遮罩半透明黑 / 0.2s 缩放淡入）。
                        一张卡问完两个问题——「悄悄删除」= 原取消分支，「删除并让角色知道」= 原确定分支。点「删除」才真删，「取消」不动任何数据。 */}
                    <div
                        onClick={() => setDeleteConfirm(null)}
                        className={`absolute inset-0 z-[70] flex items-center justify-center px-9 transition-opacity duration-200 ${deleteConfirm ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    >
                        <div className="absolute inset-0 bg-black/45"></div>
                        <div
                            onClick={e => e.stopPropagation()}
                            className={`relative w-full max-w-[292px] bg-white rounded-[14px] overflow-hidden shadow-[0_10px_44px_rgba(0,0,0,0.22)] transition-transform duration-200 ${deleteConfirm ? 'scale-100' : 'scale-95'}`}
                        >
                            <div className="px-5 pt-[22px] text-center">
                                <h3 className="text-[15px] font-bold text-[#1A1A1A]">删除这条回复？</h3>
                            </div>
                            <div className="px-5 pt-3 pb-4 space-y-2">
                                <button
                                    onClick={() => setDeleteNotify(false)}
                                    className={`w-full py-[10px] rounded-full text-[13px] border transition-colors ${!deleteNotify ? 'border-[#ff2442] text-[#ff2442] bg-[#ff2442]/[0.06] font-bold' : 'border-slate-200 text-[#9A9A9A]'}`}
                                >悄悄删除</button>
                                <button
                                    onClick={() => setDeleteNotify(true)}
                                    className={`w-full py-[10px] rounded-full text-[13px] border transition-colors ${deleteNotify ? 'border-[#ff2442] text-[#ff2442] bg-[#ff2442]/[0.06] font-bold' : 'border-slate-200 text-[#9A9A9A]'}`}
                                >删除并让角色知道</button>
                                {deleteNotify && (
                                    <p className="pt-1 text-center text-[11px] leading-[1.6] text-[#B9B9B9]">会在你们的聊天里留下一条系统消息，Ta 会知道你动用了管理权限。</p>
                                )}
                            </div>
                            <div className="flex border-t border-[#F0F0F0]">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-[13px] text-[14px] text-[#6B6B6B] active:bg-[#FAFAFA]"
                                >取消</button>
                                <div className="w-px bg-[#F0F0F0]"></div>
                                <button
                                    onClick={() => { const dc = deleteConfirm; setDeleteConfirm(null); if (dc) void handleDeleteComment(dc.post, dc.comment, { confirmed: true, notify: deleteNotify }); }}
                                    className="flex-1 py-[13px] text-[14px] font-bold text-[#ff2442] active:bg-[#FFF5F7]"
                                >删除</button>
                            </div>
                        </div>
                    </div>

                    {/* Composer Mask —— 遮罩：0.3s 淡入；弹层打开时输入条留在原位被压暗，不隐藏 */}
                    <div
                        onClick={closeComposer}
                        className={`absolute inset-0 z-40 bg-black/[0.32] transition-opacity duration-300 ${composerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        style={{ transitionTimingFunction: 'cubic-bezier(.16,1,.3,1)' }}
                    ></div>

                    {/* Composer Sheet —— 七改-UI：输入弹层（xhs 复刻：0.34s 升起 / 18px 顶圆角 / 红光标多行框 / 发送胶囊禁用#FFC9D2 可用#FF2442） */}
                    <div
                        className={`absolute left-0 right-0 bottom-0 z-50 bg-white rounded-t-[18px] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] transition-transform duration-[340ms] ${composerOpen ? 'translate-y-0' : 'translate-y-[102%]'}`}
                        style={{ transitionTimingFunction: 'cubic-bezier(.16,1,.3,1)' }}
                        onTransitionEnd={(e) => { if (e.propertyName === 'transform') (e.currentTarget as HTMLElement).style.willChange = 'auto'; }}
                    >
                        <div className="flex flex-col max-h-[92%]">
                            {/* 顶部：回复目标胶囊（可取消）+ @ 角色开关 + 收起箭头 */}
                            <div className="h-[46px] px-4 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    {replyTarget ? (
                                        <span className="flex items-center gap-1.5 bg-[#ff2442]/10 text-[#ff2442] text-[11px] font-medium px-2.5 py-1 rounded-full max-w-[60%]">
                                            <span className="truncate">回复 @{replyTarget.authorName}</span>
                                            <button onClick={() => setReplyTarget(null)} className="shrink-0 active:opacity-60">✕</button>
                                        </span>
                                    ) : (
                                        <span className="text-[12px] text-[#B9B9B9]">说点什么，让大家听到你的声音</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {/* 六改-2b：评论里也能 @ 角色——全角色可点可真通知；显示用社交 id 名（Ann 2026-09-15 定稿） */}
                                    <button
                                        onClick={() => setComposerMentionOpen(prev => !prev)}
                                        title="艾特角色"
                                        className={`w-8 h-8 flex items-center justify-center rounded-full text-[15px] font-bold active:opacity-60 ${composerMentionOpen || commentMentions.length ? 'text-[#ff2442]' : 'text-[#9A9A9A]'}`}
                                    >@</button>
                                    <button onClick={closeComposer} className="w-8 h-8 flex items-center justify-center text-[#9A9A9A] active:opacity-60" title="收起">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25 12 15.75 4.5 8.25" /></svg>
                                    </button>
                                </div>
                            </div>
                            {/* 六改-2b：@ 角色选择条（开 ~0.24s 淡入；语义同发布面板——只认用户点选，AI 文本里的 @ 是外观） */}
                            <div className={`overflow-hidden transition-all duration-[240ms] ${composerMentionOpen ? 'max-h-[120px] opacity-100' : 'max-h-0 opacity-0'}`} style={{ transitionTimingFunction: 'cubic-bezier(.16,1,.3,1)' }}>
                                <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
                                    {characters.map(c => {
                                        const mainHandle = (characterHandles[c.id] || [])[0]?.handle || c.name;
                                        const mentioned = commentMentions.includes(c.id);
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => {
                                                    if (mentioned) {
                                                        setCommentMentions(prev => prev.filter(id => id !== c.id));
                                                        // 返工⑪：同发帖——点掉选中同时删评论正文尾部的 @尾巴
                                                        const tail = new RegExp(`@${mainHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
                                                        setCommentInput(prev => prev.replace(tail, ''));
                                                    } else {
                                                        setCommentMentions(prev => [...prev, c.id]);
                                                        setCommentInput(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${mainHandle} `);
                                                    }
                                                }}
                                                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${mentioned ? 'bg-[#ff2442] text-white border-[#ff2442]' : 'bg-white text-slate-500 border-slate-200'}`}
                                            >
                                                @{mainHandle}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* 多行输入框：76px / #EDEDED 描边 / 光标品牌红 */}
                            <textarea
                                ref={composerRef}
                                value={commentInput}
                                onChange={(e) => setCommentInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
                                disabled={loadingComments || isReplyingToUser}
                                placeholder={replyTarget ? `回复 @${replyTarget.authorName}…` : '说点什么…'}
                                className="mx-4 mt-1 w-[calc(100%-32px)] h-[76px] p-[13px_14px] border border-[#EDEDED] rounded-[12px] text-[15.5px] leading-[1.45] text-[#1A1A1A] bg-white resize-none outline-none caret-[#FF2442] placeholder:text-[#B9B9B9] disabled:opacity-50"
                            />
                            {/* 工具行：左侧场景提示，右侧 发送/搅动 胶囊（空输入 = 搅动评论区，与原语义一致） */}
                            <div className="min-h-[54px] px-4 py-2 flex items-center gap-2">
                                <span className="text-[12px] text-[#C4C4C4] truncate">
                                    {commentInput.trim() ? '' : '空着按右边的按钮 = 模拟过一会儿的评论区'}
                                </span>
                                {commentInput.trim() ? (
                                    <button
                                        disabled={loadingComments || isReplyingToUser}
                                        onClick={handleSendComment}
                                        className="ml-auto h-[34px] min-w-[62px] px-[18px] rounded-full bg-[#FF2442] text-white text-[14px] font-medium disabled:opacity-60 active:scale-95 transition-transform shrink-0"
                                    >发送</button>
                                ) : (
                                    <button
                                        disabled={loadingComments || isReplyingToUser}
                                        onClick={handleSendComment}
                                        title="模拟过一会儿后评论区的样子（可能没人冒泡）"
                                        className={`ml-auto h-[34px] min-w-[62px] px-[14px] rounded-full text-[13px] font-medium active:scale-95 transition-all shrink-0 ${isReplyingToUser ? 'bg-[#FF2442] text-white' : 'bg-[#FFC9D2] text-white'}`}
                                    >{isReplyingToUser ? '正在搅动……' : '搅动评论区'}</button>
                                )}
                            </div>
                            {/* 底部安全区 */}
                            <div className="shrink-0" style={{ height: 'var(--safe-bottom, 0px)' }}></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        // Main Container with Premium Gradient Background
        <div className="h-full w-full bg-gradient-to-br from-rose-50 via-slate-50 to-teal-50 flex flex-col font-sans relative text-slate-900 overflow-hidden">
            
            {/* --- Modals (Settings, Share) --- */}
            <Modal isOpen={showSettings} title="身份管理" onClose={() => setShowSettings(false)}>
                <div className="space-y-6">
                    <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-6 px-1">
                        {/* --- 圈子管理（平行世界） --- */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-700">圈子（平行世界）</span>
                                {!editingCircle && (
                                    <button onClick={startCreateCircle} className="text-[10px] bg-[#ff2442] text-white px-2 py-1 rounded-full shadow-sm active:scale-95 transition-transform">+ 新建圈子</button>
                                )}
                            </div>
                            {editingCircle ? (
                                <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                                    <div>
                                        <label className="text-[9px] text-slate-400 uppercase font-bold">圈子名</label>
                                        <input
                                            value={editingCircle.name}
                                            onChange={e => setEditingCircle(ec => ec ? { ...ec, name: e.target.value } : ec)}
                                            placeholder="例如：古代世界"
                                            className="w-full text-sm font-bold text-slate-800 border-b border-dashed border-slate-200 focus:border-[#ff2442] outline-none py-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-400 uppercase font-bold">世界观（可选）</label>
                                        <textarea
                                            value={editingCircle.worldPrompt}
                                            onChange={e => setEditingCircle(ec => ec ? { ...ec, worldPrompt: e.target.value } : ec)}
                                            placeholder="描述这个世界：例如「这是古代世界，没有手机和网络，路人也是古人，大家用古代的语气和知识说话」"
                                            className="w-full text-xs text-slate-600 bg-white rounded-lg px-2 py-1.5 outline-none border border-slate-200 focus:border-[#ff2442] resize-none"
                                            rows={3}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-400 uppercase font-bold">圈内角色（点击选/取消）</label>
                                        <div className="grid grid-cols-4 gap-3 pt-1">
                                            {characters.map(c => {
                                                const selected = editingCircle.memberCharIds.includes(c.id);
                                                return (
                                                    <button key={c.id} onClick={() => toggleCircleMember(c.id)} className={`flex flex-col items-center gap-1 p-1 rounded-xl transition-all ${selected ? 'bg-red-50 ring-1 ring-[#ff2442]' : ''}`}>
                                                        <TokenImg value={resolveSparkCharAvatar(c.id, c.avatar, c.name)} className={`w-10 h-10 rounded-full object-cover border-2 transition-colors ${selected ? 'border-[#ff2442]' : 'border-slate-100'}`} />
                                                        <span className={`text-[9px] truncate w-full text-center ${selected ? 'text-[#ff2442] font-bold' : 'text-slate-500'}`}>{c.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => setEditingCircle(null)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl text-xs active:bg-slate-50">取消</button>
                                        <button onClick={saveEditingCircle} className="flex-1 py-2 bg-[#ff2442] text-white font-bold rounded-xl text-xs shadow-md shadow-red-200 active:scale-95 transition-transform">保存圈子</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {circles.length === 0 && (
                                        <p className="text-xs text-slate-400 bg-slate-50 p-2 rounded-lg">
                                            还没有圈子。建一个试试：起个名字、写上世界观、选几个角色，他们就拥有自己的平行小网络了。
                                        </p>
                                    )}
                                    {circles.map(c => (
                                        <div key={c.id} className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-700 truncate">{c.name}</span>
                                                    <span className="text-[9px] text-slate-400 shrink-0">{c.memberCharIds.length} 位角色</span>
                                                </div>
                                                {c.worldPrompt && <p className="text-[10px] text-slate-400 truncate">{c.worldPrompt}</p>}
                                            </div>
                                            <button onClick={() => setEditingCircle({ ...c })} className="text-slate-400 hover:text-[#ff2442] transition-colors p-1" title="编辑"><Icons.Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => deleteCircle(c.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1" title="删除">×</button>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                        {/* --- Spark 副API --- */}
                        <div className="space-y-2">
                            <span className="text-sm font-bold text-slate-700">生成 API（副 API）</span>
                            {apiPresets.length === 0 ? (
                                <p className="text-xs text-slate-400 bg-slate-50 p-2 rounded-lg">
                                    在系统设置里先添加 API 预设，就能让 Spark 单独走另一个 API，省主 API 的量。
                                </p>
                            ) : (
                                <select
                                    value={sparkApiPresetId}
                                    onChange={(e) => { setSparkApiPresetId(e.target.value); try { localStorage.setItem('spark_api_preset_id', e.target.value); } catch {} }}
                                    className="w-full text-sm bg-white rounded-xl px-3 py-2.5 outline-none border border-slate-200 focus:border-[#ff2442]"
                                >
                                    <option value="">跟随主设置</option>
                                    {apiPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 bg-slate-50 p-2 rounded-lg">
                            为角色添加“马甲”(Sub-Accounts)。AI 发帖时会根据内容选择合适的身份。
                        </p>
                        {/* 分组筛选（没建分组时不渲染） */}
                        <CharacterGroupFilterBar characters={characters} groups={characterGroups} value={identityGroupId} onChange={setIdentityGroupId} className="!mt-3 -mx-1 px-1" />
                        {filterCharactersByGroup(characters, characterGroups, identityGroupId).map(c => (
                            <div key={c.id} className="space-y-3 pb-4 border-b border-slate-50">
                                <div className="flex items-center gap-2">
                                    {/* v8c-1（Ann 2026-09-16）：点头像本身 → 设置这个角色的 Spark 头像 */}
                                    <button onClick={() => { setSparkAvatarEditChar({ id: c.id, name: c.name }); setSparkAvatarLinkDraft(null); }} className="shrink-0 active:scale-90 transition-transform" title={`${c.name}的 Spark 头像`}>
                                        <TokenImg value={resolveSparkCharAvatar(c.id, c.avatar, c.name)} className="w-6 h-6 rounded-full object-cover" />
                                    </button>
                                    <span className="text-sm font-bold text-slate-700">{c.name}</span>
                                    {/* Spark 私聊开关（Ann 2026-09-15：per-character 硬闸；localStorage 不驱动 React，点击后 setIdentityGroupId 强刷重渲染） */}
                                    <button
                                        onClick={() => { setPrivateChatOff(c.id, !loadPrivateChatOff()[c.id]); forceIdentityTick(t => t + 1); addToast(loadPrivateChatOff()[c.id] ? `${c.name} 的 Spark 私聊已关` : `${c.name} 的 Spark 私聊已开`, 'info'); }}
                                        className="text-[10px] px-2 py-1 rounded-full border active:scale-95 transition-transform"
                                        style={loadPrivateChatOff()[c.id]
                                            ? { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }
                                            : { background: '#ff2442', color: '#fff', borderColor: '#ff2442' }}
                                    >{loadPrivateChatOff()[c.id] ? '私聊关' : '私聊开'}</button>
                                    {/* spark-follow 2-B：关注「发帖开/关」——语义与私聊开关相反：名单里=开，不在名单=关，默认全关 */}
                                    <button
                                        onClick={() => { setMomentsPostOn(c.id, !loadMomentsPostOn()[c.id]); forceIdentityTick(t => t + 1); addToast(loadMomentsPostOn()[c.id] ? `${c.name} 的关注发帖已开` : `${c.name} 的关注发帖已关`, 'info'); }}
                                        className="text-[10px] px-2 py-1 rounded-full border active:scale-95 transition-transform"
                                        style={loadMomentsPostOn()[c.id]
                                            ? { background: '#ff2442', color: '#fff', borderColor: '#ff2442' }
                                            : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }}
                                    >{loadMomentsPostOn()[c.id] ? '发帖开' : '发帖关'}</button>
                                    <button onClick={() => addSubAccount(c.id)} className="ml-auto text-[10px] bg-[#ff2442] text-white px-2 py-1 rounded-full shadow-sm active:scale-95 transition-transform">+ 添加马甲</button>
                                </div>
                                
                                <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                                    {(characterHandles[c.id] || []).map((acct) => (
                                        <div key={acct.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm space-y-2 relative group">
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <label className="text-[9px] text-slate-400 uppercase font-bold">网名 (Handle)</label>
                                                    <input 
                                                        value={acct.handle} 
                                                        onChange={(e) => updateSubAccount(c.id, acct.id, 'handle', e.target.value)} 
                                                        className="w-full text-sm font-bold text-slate-800 border-b border-dashed border-slate-200 focus:border-[#ff2442] outline-none py-1" 
                                                    />
                                                </div>
                                                <button 
                                                    onClick={() => deleteSubAccount(c.id, acct.id)}
                                                    className="text-slate-300 hover:text-red-400 p-1"
                                                    title="删除"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-400 uppercase font-bold">备注 (Context Note)</label>
                                                <input 
                                                    value={acct.note} 
                                                    onChange={(e) => updateSubAccount(c.id, acct.id, 'note', e.target.value)} 
                                                    placeholder="例如: 吐槽号 / 认真模式"
                                                    className="w-full text-xs text-slate-500 bg-slate-50 rounded px-2 py-1 focus:bg-white transition-colors outline-none" 
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {(characterHandles[c.id]?.length || 0) === 0 && (
                                        <div className="text-[10px] text-red-400 italic flex items-center gap-1"><Warning size={12} weight="bold" /> 请至少保留一个身份</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={handleClearFeed} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl text-xs active:bg-slate-50">清空推荐流</button>
                        <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-[#ff2442] text-white font-bold rounded-xl text-xs shadow-lg shadow-red-200 active:scale-95 transition-transform">完成</button>
                    </div>
                    {/* 五修-5：清理 Spark 图片缓存——删除所有没有被任何帖子引用的本地图片 */}
                    <button
                        onClick={async () => {
                            try {
                                const referenced = new Set<string>();
                                feedRef.current.forEach(p => (p.images || []).forEach(v => {
                                    if (typeof v === 'string' && v.startsWith('sparkimg:')) referenced.add(v.slice('sparkimg:'.length));
                                }));
                                const all = await DB.getAllAssets();
                                const orphans = all.filter(a => a.id.startsWith('spark_img_') && !referenced.has(a.id));
                                if (!orphans.length) { addToast('没有可清理的图片缓存', 'info'); return; }
                                if (!window.confirm(`发现 ${orphans.length} 张不再被引用的帖子图片，清理掉吗？`)) return;
                                for (const a of orphans) await DB.deleteAsset(a.id);
                                addToast(`已清理 ${orphans.length} 张图片缓存`, 'success');
                            } catch (e: any) {
                                addToast(`清理失败: ${e?.message || e}`, 'error');
                            }
                        }}
                        className="w-full py-2.5 bg-white border border-slate-200 text-slate-400 font-bold rounded-xl text-[10px] active:bg-slate-50"
                    >
                        清理 Spark 图片缓存（只删未被引用的）
                    </button>
                </div>
            </Modal>

            {/* v8c-1（Ann 2026-09-16）：Spark 角色头像设置面板 —— 文案定稿：标题「{角色名}的 Spark 头像」，
                选项「上传图片」/「填图片链接」/「恢复默认」，底部「取消」。 */}
            <Modal
                isOpen={!!sparkAvatarEditChar}
                title={sparkAvatarEditChar ? `${sparkAvatarEditChar.name}的 Spark 头像` : ''}
                onClose={() => { setSparkAvatarEditChar(null); setSparkAvatarLinkDraft(null); }}
                footer={
                    <button
                        onClick={() => { setSparkAvatarEditChar(null); setSparkAvatarLinkDraft(null); }}
                        className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform"
                    >
                        取消
                    </button>
                }
            >
                <div className="space-y-2">
                    <button
                        onClick={() => sparkCharAvatarInputRef.current?.click()}
                        className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-2xl text-sm active:bg-slate-50"
                    >
                        上传图片
                    </button>
                    <button
                        onClick={() => setSparkAvatarLinkDraft(prev => (prev === null ? '' : null))}
                        className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-2xl text-sm active:bg-slate-50"
                    >
                        填图片链接
                    </button>
                    {sparkAvatarLinkDraft !== null && (
                        <div className="flex gap-2">
                            <input
                                value={sparkAvatarLinkDraft}
                                onChange={e => setSparkAvatarLinkDraft(e.target.value)}
                                placeholder="粘贴图片链接"
                                className="flex-1 min-w-0 text-xs text-slate-600 bg-white rounded-xl px-2 py-2 outline-none border border-slate-200 focus:border-[#ff2442]"
                            />
                            <button
                                onClick={saveSparkCharAvatarLink}
                                className="px-3 py-2 bg-[#ff2442] text-white font-bold rounded-xl text-xs shadow-sm shadow-red-200 active:scale-95 transition-transform"
                            >
                                保存
                            </button>
                        </div>
                    )}
                    <button
                        onClick={resetSparkCharAvatar}
                        className="w-full py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-2xl text-sm active:bg-slate-50"
                    >
                        恢复默认
                    </button>
                    <input type="file" ref={sparkCharAvatarInputRef} className="hidden" accept="image/*" onChange={handleSparkCharAvatarUpload} />
                </div>
            </Modal>

            <Modal isOpen={showShareModal} title="分享帖子" onClose={() => setShowShareModal(false)}>
                {/* 分组筛选（没建分组时不渲染） */}
                <CharacterGroupFilterBar characters={characters} groups={characterGroups} value={shareGroupId} onChange={setShareGroupId} className="mb-1 px-2" />
                <div className="grid grid-cols-4 gap-4 p-2">
                    {filterCharactersByGroup(characters, characterGroups, shareGroupId).map(c => (
                        <button key={c.id} onClick={() => handleShare(c.id, false)} className="flex flex-col items-center gap-2 group">
                            <TokenImg value={resolveSparkCharAvatar(c.id, c.avatar, c.name)} className="w-12 h-12 rounded-full object-cover border border-slate-100 group-active:scale-90 transition-transform" />
                            <span className="text-[10px] text-slate-600 truncate w-full text-center">{c.name}</span>
                        </button>
                    ))}
                </div>
                {/* v9：追踪说明与「断开动态同步」按钮已随追踪职责迁往底部同步星 / 同步弹窗，分享 = 作者纯净版 */}
            </Modal>

            <Modal isOpen={showSyncModal} title="让角色知道" onClose={() => setShowSyncModal(false)}>
                <CharacterGroupFilterBar characters={characters} groups={characterGroups} value={syncGroupId} onChange={setSyncGroupId} className="mb-1 px-2" />
                <div className="grid grid-cols-4 gap-4 p-2">
                    {filterCharactersByGroup(characters, characterGroups, syncGroupId).map(c => (
                        <button key={c.id} onClick={() => handleSyncToChar(c.id)} className="flex flex-col items-center gap-2 group">
                            <TokenImg value={resolveSparkCharAvatar(c.id, c.avatar, c.name)} className="w-12 h-12 rounded-full object-cover border border-slate-100 group-active:scale-90 transition-transform" />
                            <span className="text-[10px] text-slate-600 truncate w-full text-center">{c.name}</span>
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-slate-400 text-center px-2 pb-1">把这条动态放进角色的记忆，让 TA 知道自己发布过 / 评论过 / 谁回复了用户</p>
                {/* v9：断开按钮从分享弹窗迁入（Ann 拍板：功能不丢只换位置）——帖被追踪过才显示 */}
                {selectedPost && (loadTrackedSparkPosts()[selectedPost.id]) && (
                    <button
                        onClick={() => { if (selectedPost) { untrackSparkPost(selectedPost.id); addToast('已断开这条帖子的动态同步', 'success'); } }}
                        className="w-[calc(100%-32px)] mx-4 mb-3 py-2.5 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl text-xs active:bg-slate-50"
                    >
                        断开这条帖子的动态同步
                    </button>
                )}
            </Modal>

            {/* --- Create Post Modal (Full Screen Overlay) --- */}
            {isCreateOpen && (
                <div className="absolute inset-0 z-50 bg-white flex flex-col animate-slide-up">
                    {/* Create Header —— 自理安全区：外层扛 safe-top + 背景，内层保持 h-14 内容栏（同主栏，避开 border-box 吃 padding） */}
                    <div className="sticky top-0 z-20 bg-white border-b border-slate-50" style={{ paddingTop: 'var(--safe-top)' }}>
                        <div className="h-14 flex items-center justify-between px-4">
                            <button onClick={() => { setNewPostMentions([]); setNewPostWorldCircleId(''); setNewPostExcludedCharIds([]); setNewPostVisibleCharIds([]); setEditingPostId(null); setIsCreateOpen(false); }} className="text-slate-600 text-sm font-bold px-2 py-1">取消</button>
                            <span className="text-sm font-bold text-slate-800">{editingPostId ? '编辑笔记' : '发布笔记'}</span>
                            <button
                                onClick={handleCreatePost}
                                disabled={!newPostContent.trim()}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold text-white transition-all ${newPostContent.trim() ? 'bg-[#ff2442] shadow-md shadow-red-200' : 'bg-slate-200 text-slate-400'}`}
                            >
                                {editingPostId ? '保存' : '发布'}
                            </button>
                        </div>
                    </div>

                    {/* Create Content */}
                    <div className="flex-1 overflow-y-auto no-scrollbar p-6">
                        <input 
                            value={newPostTitle} 
                            onChange={e => setNewPostTitle(e.target.value)} 
                            placeholder="填写标题会有更多赞哦~" 
                            className="text-xl font-black placeholder:text-slate-300 outline-none mb-4 w-full" 
                        />
                        <textarea 
                            value={newPostContent} 
                            onChange={e => setNewPostContent(e.target.value)} 
                            placeholder="分享你此刻的想法..." 
                            className="w-full h-auto min-h-[200px] resize-none outline-none text-base leading-relaxed placeholder:text-slate-300 font-medium" 
                        />

                        {/* 五修-4：自定义 tag 输入（中英文逗号/空格分隔） */}
                        <input 
                            value={newPostTags} 
                            onChange={e => setNewPostTags(e.target.value)} 
                            placeholder="添加标签，如：美食 探店, 周末vlog（逗号或空格分隔，可不填）" 
                            className="w-full mt-4 px-3 py-2 rounded-xl bg-slate-50 text-xs text-slate-600 placeholder:text-slate-300 outline-none" 
                        />

                        {/* 五修-5：发帖图片（多张、自动压缩；不选图 = 用下方 emoji 贴纸） */}
                        <div className="mt-4 pt-4 border-t border-slate-50">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">添加图片（最多 9 张，自动压缩）</p>
                                {newPostImages.length < 9 && (
                                    <button onClick={() => newPostImageInputRef.current?.click()} className="text-[10px] font-bold text-[#ff2442] px-2 py-1 rounded-full bg-red-50">+ 选图</button>
                                )}
                            </div>
                            {newPostImages.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                    {newPostImages.map((src, i) => (
                                        <div key={i} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-slate-100">
                                            <img src={src} className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => setNewPostImages(prev => prev.filter((_, idx) => idx !== i))}
                                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] flex items-center justify-center"
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <input type="file" ref={newPostImageInputRef} className="hidden" accept="image/*" multiple onChange={e => { handleNewPostImages(e.target.files); e.target.value = ''; }} />
                        </div>
                        
                        {/* Sticker Selector - Flowing after text（六改-1：选了真实图片时互斥隐藏，emoji 是背景、图与背景不叠加） */}
                        <div className="mt-4 pt-4 border-t border-slate-50">
                            {newPostImages.length > 0 ? (
                                <p className="text-[10px] text-slate-400">已选图片，emoji 背景停用（清空图片后可重新选择）</p>
                            ) : (
                                <>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">添加心情贴纸 (Sticker)</p>
                                    <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                                        {STICKER_OPTIONS.map(sticker => (
                                            <button
                                                key={sticker.code}
                                                onClick={() => setNewPostEmoji(sticker.code)}
                                                className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all shrink-0 ${newPostEmoji === sticker.code ? 'border-[#ff2442] bg-red-50' : 'border-slate-100'}`}
                                            >
                                                <img src={twemojiUrl(sticker.code)} alt={sticker.label} className="w-7 h-7" />
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* spark-follow 2-F：编辑关注帖（moments）时——藏掉圈子/不给谁看/发帖@，另出一排「谁可以看见」：
                            列出除作者外的全部角色，勾上 = 进 visibleCharIds（下次评论/搅动才带 Ta 的人设和记忆）。
                            用户发笔记/编用户笔记：现有面板原样。 */}
                        {editingPostId && feed.find(p => p.id === editingPostId)?.origin === 'moments' ? (
                            <div className="mt-4 pt-4 border-t border-slate-50">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">谁可以看见（勾了的角色才进这条动态的评论/搅动名单；作者自己永远看得见）</p>
                                {newPostVisibleCharIds.length > 0 && (
                                    <p className="text-[10px] text-slate-400 mb-2">已勾：{newPostVisibleCharIds.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join('、')}</p>
                                )}
                                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                    {characters.filter(c => c.id !== feed.find(p => p.id === editingPostId)?.authorCharId).map(c => {
                                        const visible = newPostVisibleCharIds.includes(c.id);
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => setNewPostVisibleCharIds(prev => (visible ? prev.filter(id => id !== c.id) : [...prev, c.id]))}
                                                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${visible ? 'bg-[#ff2442] text-white border-[#ff2442]' : 'bg-white text-slate-500 border-slate-200'}`}
                                            >
                                                {c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                        <>
                        {/* v8c-2（Ann 2026-09-16）：圈子 —— 选了只附加该圈的世界观原文，角色范围不因此受限 */}
                        <div className="mt-4 pt-4 border-t border-slate-50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">圈子（只附加该圈的世界观，不限角色范围）</p>
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                <button
                                    onClick={() => setNewPostWorldCircleId('')}
                                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${newPostWorldCircleId === '' ? 'bg-[#ff2442] text-white border-[#ff2442]' : 'bg-white text-slate-500 border-slate-200'}`}
                                >
                                    不附加
                                </button>
                                {circles.filter(c => (c.worldPrompt || '').trim()).map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => setNewPostWorldCircleId(prev => (prev === c.id ? '' : c.id))}
                                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${newPostWorldCircleId === c.id ? 'bg-[#ff2442] text-white border-[#ff2442]' : 'bg-white text-slate-500 border-slate-200'}`}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* v8c-2：不给谁看 —— 勾掉的角色不进生成池、不发人设和记忆 */}
                        <div className="mt-4 pt-4 border-t border-slate-50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">不给谁看（勾掉的角色看不到这条笔记）</p>
                            {newPostExcludedCharIds.length > 0 && (
                                <p className="text-[10px] text-slate-400 mb-2">已勾掉：{newPostExcludedCharIds.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join('、')}</p>
                            )}
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                {characters.map(c => {
                                    const excluded = newPostExcludedCharIds.includes(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => setNewPostExcludedCharIds(prev => (excluded ? prev.filter(id => id !== c.id) : [...prev, c.id]))}
                                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${excluded ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200'}`}
                                        >
                                            {c.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* @ 全角色可点可真通知；显示用社交 id 名——Ann 2026-09-15 定稿 */}
                        <div className="mt-4 pt-4 border-t border-slate-50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">@ 角色（Ta 会收到这条笔记的通知）</p>
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                {characters.map(c => {
                                    const mainHandle = (characterHandles[c.id] || [])[0]?.handle || c.name;
                                    const mentioned = newPostMentions.includes(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                if (mentioned) {
                                                    setNewPostMentions(prev => prev.filter(id => id !== c.id));
                                                    // 返工⑪：点掉选中的同时删掉正文尾部对应的 @尾巴（匹配不到就安全降级不删）
                                                    const tail = new RegExp(`@${mainHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
                                                    setNewPostContent(prev => prev.replace(tail, ''));
                                                } else {
                                                    setNewPostMentions(prev => [...prev, c.id]);
                                                    setNewPostContent(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${mainHandle} `);
                                                }
                                            }}
                                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${mentioned ? 'bg-[#ff2442] text-white border-[#ff2442]' : 'bg-white text-slate-500 border-slate-200'}`}
                                        >
                                            @{mainHandle}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        </>
                        )}
                    </div>
                </div>
            )}

            {/* --- Main Feed View --- */}
            <div className={`flex-col h-full ${selectedPost || isCreateOpen ? 'hidden' : 'flex'}`}>
                
                {/* Top Nav - Glass —— 自理安全区：外层扛 safe-top + 背景（无固定高度，padding 正常撑开到刘海/灵动岛下），
                    内层保持 h-11 内容栏、文字居中。不能把 paddingTop 直接加到 h-11 上：border-box 会把 padding 吃进
                    固定高度，content-box 塌成 0，文字被挤到白条下沿、跨在白/渐变交界上被劈开。sticky 必须留在外层。 */}
                <div className="sticky top-0 z-30 bg-white/60 backdrop-blur-xl border-b border-white/20" style={{ paddingTop: 'var(--safe-top)' }}>
                    <div className="h-11 flex items-center justify-between px-4">
                        <button onClick={closeApp} className="p-1"><Icons.Back onClick={closeApp} /></button>
                        <div className="flex gap-6 text-base font-bold text-slate-300">
                            <button className={`${activeTab === 'home' ? 'text-slate-800 scale-110 border-b-2 border-[#ff2442] pb-1' : 'hover:text-slate-500'} transition-all`} onClick={() => { setActiveTab('home'); trackEvent('切换 Spark 主标签', { tab: 'home' }); }}>发现</button>
                            {/* spark-follow 2-C：顶部「我的」改名「关注」；用户主页只从右下角人形进 */}
                            <button className={`${activeTab === 'follow' ? 'text-slate-800 scale-110 border-b-2 border-[#ff2442] pb-1' : 'hover:text-slate-500'} transition-all`} onClick={() => { setActiveTab('follow'); trackEvent('切换 Spark 主标签', { tab: 'follow' }); }}>关注</button>
                        </div>
                        <button onClick={() => { setShowSettings(true); trackEvent('打开身份管理面板'); }} className="text-slate-800 font-bold text-sm">管理</button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    
                    {activeTab === 'home' && (
                        <div className="p-2 min-h-full">
                            {/* Circle Switcher（建了圈子才显示） */}
                            {circles.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pt-3 pb-1">
                                    {[{ id: SPARK_CIRCLE_ALL, name: '全部' }, ...circles].map(c => {
                                        const isActive = activeCircleId === c.id || (c.id === SPARK_CIRCLE_ALL && activeCircleId === SPARK_CIRCLE_ALL);
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => switchCircle(c.id)}
                                                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${isActive ? 'bg-[#ff2442] text-white border-[#ff2442] shadow-sm shadow-red-200' : 'bg-white/80 text-slate-500 border-slate-200 hover:text-[#ff2442]'}`}
                                            >
                                                {c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {/* Refresh Button - Above Posts */}
                            <div className="flex items-center justify-center py-3">
                                {isRefreshing ? (
                                    <div className="text-center text-xs text-[#ff2442] font-bold animate-pulse flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-[#ff2442] border-t-transparent rounded-full animate-spin"></div> 正在获取新鲜事...
                                    </div>
                                ) : (
                                    <button onClick={handleRefresh} className="px-6 py-2 bg-white/80 backdrop-blur-md rounded-full text-xs font-bold text-slate-500 shadow-sm border border-white hover:text-[#ff2442] active:scale-95 transition-all">
                                        点击刷新推荐流
                                    </button>
                                )}
                            </div>
                            {/* P4：CSS columns 是"先填满左列再填右列"，右列开头天然是旧帖，
                                视觉上"新帖在上、旧帖夹中间"。改双列轮转：奇偶交替分列，
                                两列都从最新开始交错往下——观感保持瀑布流、顺序保持时间线 */}
                            {(() => {
                                // 五修-11：推荐流只放 AI/路人帖；用户自己发的帖只在主页「笔记」tab 展示
                                // spark-follow 2-D：发现不放关注帖（moments）
                                const timeline = filterPostsByCircle(feed, activeCircleId, validCircleIds)
                                    .filter(p => p.authorType !== 'user' && p.origin !== 'moments');
                                const colA = timeline.filter((_, i) => i % 2 === 0);
                                const colB = timeline.filter((_, i) => i % 2 === 1);
                                return (
                                    <div className="flex gap-2 items-start pb-24">
                                        <div className="flex-1 space-y-2 min-w-0">{colA.map(post => renderFeedItem(post))}</div>
                                        <div className="flex-1 space-y-2 min-w-0">{colB.map(post => renderFeedItem(post))}</div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* spark-follow 2-C：关注页 —— 只要 origin === 'moments' 的帖；没有刷新、没有圈子条；
                        学发现的瀑布流排版 + 笔记 tab 的编辑/删除角标；空了学笔记 tab 的「空空如也」 */}
                    {activeTab === 'follow' && (
                        <div className="p-2 min-h-full">
                            {(() => {
                                const momentsFeed = feed.filter(p => p.origin === 'moments').sort((a, b) => b.timestamp - a.timestamp);
                                const colA = momentsFeed.filter((_, i) => i % 2 === 0);
                                const colB = momentsFeed.filter((_, i) => i % 2 === 1);
                                const renderFollowItem = (post: SocialPost) => (
                                    <div key={post.id} className="relative">
                                        {renderFeedItem(post, { hideDelete: true })}
                                        {/* 学笔记 tab：编辑/删除；删关注帖走现有 handleDeletePost，顺手断开这条帖的追踪 */}
                                        <div className="absolute top-2 right-2 z-20 flex gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); startEditPost(post); }} className="w-6 h-6 rounded-full bg-white/90 shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform" title="编辑">
                                                <Pencil size={12} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); if (window.confirm('删除这条关注动态？评论区也会一起删掉。')) { handleDeletePost(post.id); untrackSparkPost(post.id); } }} className="w-6 h-6 rounded-full bg-white/90 shadow-sm border border-slate-100 flex items-center justify-center text-red-300 active:scale-90 transition-transform" title="删除">
                                                <Trash size={12} />
                                            </button>
                                        </div>
                                    </div>
                                );
                                return (
                                    <div className="flex gap-2 items-start pb-24">
                                        <div className="flex-1 space-y-2 min-w-0">{colA.map(renderFollowItem)}</div>
                                        <div className="flex-1 space-y-2 min-w-0">{colB.map(renderFollowItem)}</div>
                                    </div>
                                );
                            })()}
                            {feed.filter(p => p.origin === 'moments').length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
                                    <Package size={48} className="text-slate-300 opacity-30" />
                                    <span className="text-xs">空空如也</span>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'me' && (
                        <div className="min-h-full bg-white/80 backdrop-blur-xl animate-fade-in">
                            {/* Profile Header (Enhanced) */}
                            <div className="relative group">
                                <div className="h-40 w-full overflow-hidden bg-slate-200 relative cursor-pointer" onClick={() => userBgInputRef.current?.click()}>
                                    {userBgImage ? (
                                        <TokenImg value={userBgImage} className="w-full h-full object-cover" />
                                    ) : (
                                        <TokenImg value={userProfile.avatar} className="w-full h-full object-cover blur-2xl opacity-60 scale-125" />
                                    )}
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <span className="text-white text-xs font-bold bg-black/30 px-3 py-1 rounded-full backdrop-blur-md">更换背景</span>
                                    </div>
                                    <input type="file" ref={userBgInputRef} className="hidden" accept="image/*" onChange={handleUserBgUpload} />
                                </div>
                                
                                <div className="px-6 relative -mt-12 flex justify-between items-end">
                                    {/* Social Avatar - Clickable to change */}
                                    <div className="w-24 h-24 rounded-full p-1 bg-white/90 backdrop-blur-md shadow-lg relative group cursor-pointer" onClick={() => socialAvatarInputRef.current?.click()}>
                                        <TokenImg value={socialProfile.avatar} className="w-full h-full rounded-full object-cover" />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full">
                                            <span className="text-white text-[10px] font-bold">更换</span>
                                        </div>
                                        <input type="file" ref={socialAvatarInputRef} className="hidden" accept="image/*" onChange={handleSocialAvatarUpload} />
                                    </div>

                                    <div className="flex gap-2 mb-2">
                                        <button onClick={() => { setIsEditingId(!isEditingId); if(isEditingId) saveUserProfileChanges(); }} className="px-4 py-1.5 rounded-full border border-slate-200/60 bg-white/50 backdrop-blur-sm text-xs font-bold text-slate-600 hover:bg-white transition-colors">
                                            {isEditingId ? '保存资料' : '编辑资料'}
                                        </button>
                                        <button className="p-1.5 rounded-full border border-slate-200/60 bg-white/50 backdrop-blur-sm text-slate-600 hover:bg-white transition-colors"><Icons.Share className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="px-6 pt-4 pb-6">
                                {isEditingId ? (
                                    <input 
                                        value={socialProfile.name} 
                                        onChange={e => setSocialProfile({...socialProfile, name: e.target.value})}
                                        className="text-2xl font-black text-slate-800 bg-slate-100/50 px-2 rounded outline-none border-b border-dashed border-slate-300 w-full mb-1"
                                    />
                                ) : (
                                    <h2 className="text-2xl font-black text-slate-800">{socialProfile.name}</h2>
                                )}

                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-slate-400 font-mono">Spark ID: </span>
                                    {isEditingId ? (
                                        <input 
                                            value={userSparkId} 
                                            onChange={e => setUserSparkId(e.target.value)} 
                                            className="text-xs font-mono text-slate-600 bg-slate-100 px-1 rounded outline-none border-b border-primary w-24"
                                        />
                                    ) : (
                                        <span className="text-xs text-slate-400 font-mono">{userSparkId}</span>
                                    )}
                                </div>
                                
                                {isEditingId ? (
                                    <textarea 
                                        value={socialProfile.bio} 
                                        onChange={e => setSocialProfile({...socialProfile, bio: e.target.value})}
                                        className="w-full mt-3 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg outline-none resize-none border border-slate-200 focus:border-primary/50"
                                        rows={3}
                                        placeholder="填写你的个人简介..."
                                    />
                                ) : (
                                    <p className="text-sm text-slate-600 mt-3 leading-relaxed font-light">{socialProfile.bio}</p>
                                )}

                                <div className="flex gap-6 mt-5 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-sm">
                                    <div className="text-center"><span className="block font-bold text-slate-800">142</span><span className="text-[10px] text-slate-400">关注</span></div>
                                    <div className="text-center"><span className="block font-bold text-slate-800">12.5k</span><span className="text-[10px] text-slate-400">粉丝</span></div>
                                    <div className="text-center"><span className="block font-bold text-slate-800">8902</span><span className="text-[10px] text-slate-400">获赞与收藏</span></div>
                                </div>
                            </div>

                            {/* Sticky Tabs */}
                            <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-slate-100 flex">
                                <button onClick={() => { setProfileTab('notes'); trackEvent('切换个人主页子标签', { tab: 'notes' }); }} className={`flex-1 py-3 text-sm font-bold transition-colors ${profileTab === 'notes' ? 'text-slate-900 border-b-2 border-[#ff2442]' : 'text-slate-400'}`}>笔记</button>
                                <button onClick={() => { setProfileTab('collects'); trackEvent('切换个人主页子标签', { tab: 'collects' }); }} className={`flex-1 py-3 text-sm font-bold transition-colors ${profileTab === 'collects' ? 'text-slate-900 border-b-2 border-[#ff2442]' : 'text-slate-400'}`}>收藏</button>
                            </div>

                            <div className="p-2 min-h-[300px] bg-slate-50/50 pb-24">
                                {/* P4：同首页——columns 改双列轮转，笔记/收藏两列从最新交错往下 */}
                                {(() => {
                                    const mine = feed.filter(p => profileTab === 'notes' ? (p.authorType === 'user' || (!p.authorType && p.authorName === socialProfile.name)) : p.isCollected);
                                    const colA = mine.filter((_, i) => i % 2 === 0);
                                    const colB = mine.filter((_, i) => i % 2 === 1);
                                    const renderMiniCard = (post: SocialPost) => (
                                        <div key={post.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 relative">
                                            {/* 五修-11：用户帖（笔记 tab）带管理入口——编辑/删除；收藏帖没有 */}
                                            {profileTab === 'notes' && (
                                                <div className="absolute top-2 right-2 z-10 flex gap-1" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => startEditPost(post)} className="w-6 h-6 rounded-full bg-white/90 shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform" title="编辑">
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button onClick={() => { if (window.confirm('删除这条笔记？评论区也会一起删掉。')) { handleDeletePost(post.id); } }} className="w-6 h-6 rounded-full bg-white/90 shadow-sm border border-slate-100 flex items-center justify-center text-red-300 active:scale-90 transition-transform" title="删除">
                                                        <Trash size={12} />
                                                    </button>
                                                </div>
                                            )}
                                            <div onClick={() => handleOpenPost(post)} className="cursor-pointer">
                                                <div className="aspect-[4/5] flex items-center justify-center text-4xl overflow-hidden" style={{ background: post.bgStyle }}>
                                                    {post.images.length > 0 && renderPostMedia(post.images[0], 'text-4xl', 'w-full h-full object-cover')}
                                                </div>
                                                <div className="p-3">
                                                    <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">{post.title}</h4>
                                                    <div className="flex justify-between items-center mt-2">
                                                        <div className="flex items-center gap-1"><TokenImg value={resolveSparkCharAvatar(post.authorCharId, post.authorAvatar, post.authorName)} className="w-3 h-3 rounded-full" /><span className="text-[9px] text-slate-400 truncate w-12">{post.authorName}</span></div>
                                                        <div className="flex items-center gap-0.5 text-slate-400"><Icons.Heart filled={post.isLiked} className="w-3 h-3" /><span className="text-[9px] whitespace-nowrap">{fmtCount(post.likes)}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                    return (
                                        <div className="flex gap-2 items-start">
                                            <div className="flex-1 space-y-2 min-w-0">{colA.map(renderMiniCard)}</div>
                                            <div className="flex-1 space-y-2 min-w-0">{colB.map(renderMiniCard)}</div>
                                        </div>
                                    );
                                })()}
                                {feed.filter(p => profileTab === 'notes' ? (p.authorType === 'user' || (!p.authorType && p.authorName === socialProfile.name)) : p.isCollected).length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
                                        <Package size={48} className="text-slate-300 opacity-30" />
                                        <span className="text-xs">空空如也</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Navigation - Floating Glass Island (Only shown when not creating) */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] h-16 bg-white/80 backdrop-blur-2xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/50 flex items-center justify-around z-40">
                    <button onClick={() => { setActiveTab('home'); trackEvent('切换 Spark 主标签', { tab: 'home' }); }} className={`text-sm font-medium flex flex-col items-center justify-center gap-0.5 transition-all w-12 h-12 rounded-full ${activeTab === 'home' ? 'text-slate-900 bg-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <House size={24} weight={activeTab === 'home' ? 'fill' : 'regular'} />
                    </button>
                    <button onClick={() => { setNewPostMentions([]); setNewPostWorldCircleId(''); setNewPostExcludedCharIds([]); setNewPostVisibleCharIds([]); setIsCreateOpen(true); trackEvent('打开发布笔记面板'); }} className="w-12 h-12 bg-[#ff2442] text-white rounded-full flex items-center justify-center shadow-lg shadow-red-200 active:scale-95 transition-transform text-2xl font-light -mt-6 border-4 border-white/50">+</button>
                    <button onClick={() => { setActiveTab('me'); trackEvent('切换 Spark 主标签', { tab: 'me' }); }} className={`text-sm font-medium flex flex-col items-center justify-center gap-0.5 transition-all w-12 h-12 rounded-full ${activeTab === 'me' ? 'text-slate-900 bg-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <User size={24} />
                    </button>
                </div>
            </div>

            {selectedPost && renderDetail()}
        </div>
    );
};

export default SocialApp;
