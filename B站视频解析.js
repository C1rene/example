import plugin from '../../lib/plugins/plugin.js'
import _ from 'lodash'

const regB23 = /(b23\.tv|bili2233.cn)\\?\/\w{7}/
const regBV = /BV1\w{9}/
const regAV = /av\d+/
const regMD = /md\d+/ // media_id 番剧md号
const regSS = /ss\d+/ // season_id 番剧id
const regEP = /ep\d+/ // episode_id 番剧剧集编号

// 通用空值处理：接口缺少字段时显示默认文本，避免输出 undefined/null
function displayValue(value, fallback = "暂无") {
    return value === undefined || value === null || value === ""
        ? fallback
        : value
}

function formatNumber(num) {
    if (num === undefined || num === null || num === "") {
        return "暂无"
    }

    num = Number(num)

    if (!Number.isFinite(num)) {
        return "暂无"
    }

    if (num < 10000) {
        return num
    } else {
        return (num / 10000).toFixed(1) + "万"
    }
}

function formatDurationDesc(seconds) {
    seconds = Math.floor(seconds);

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (h > 0) parts.push(`${h}小时`);
    if (m > 0) parts.push(`${m}分`);
    if (s > 0) parts.push(`${s}秒`);

    return parts.join('');
}

export class bilitv extends plugin {
    constructor(){
        super({
            name: "bilitv",
            dsc: "b站解析",
            event: "message",
            priority: 114514,
            rule:[
                {
                    reg: regBV,
                    fnc: "jxsp"
                },
                {
                    reg: regAV,
                    fnc: "jxsp"
                },
                {
                    reg: regB23,
                    fnc: "jxsp"
                },
                {
                    reg: regSS,
                    fnc: "jxfj"
                },
                {
                    reg: regMD,
                    fnc: "jxfj"
                },
                {
                    reg: regEP,
                    fnc: "jxfj"
                }
            ]
        })
    }

    async jxsp(e){
        let bvid = ""
        if(e.msg.match(regAV)){
            let table = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF'
            let tr = {}
            for (let i = 0; i < 58; i++) { tr[table[i]] = i }
            const s = [11, 10, 3, 8, 4, 6]
            const xor = 177451812
            const add = 8728348608
            let x = (regAV.exec(e.msg))[0].replace(/av/g, "")
            x = (x ^ xor) + add
            const r = Array.from('BV1  4 1 7  ')
            for (let i = 0; i < 6; i++) {
                r[s[i]] = table[Math.floor(x / 58 ** i) % 58]
            }
            bvid = r.join("")
            if(!(bvid.match(regBV))){
                return true
            }
        }

        if(e.msg.includes("点赞") && e.msg.includes("投币")){ return true }
        if(e.msg.match(regB23)){
            let realUrl
            try {
                const shortLinkMatch = regB23.exec(e.msg)
                if (!shortLinkMatch) {
                    e.reply("无法识别 B 站短链接")
                    return true
                }
                const shortLinkPart = shortLinkMatch[0].replace(/\\/g, "")
                const response = await fetch("https://" + shortLinkPart, { redirect: 'follow' })
                realUrl = response.url
                if (!realUrl) {
                    throw new Error("短链接跳转后未获取到目标地址")
                }
            } catch(err) {
                console.error("B23短链接跳转失败:", err)
                e.reply("B站短链接跳转失败，请稍后重试")
                return true
            }

            const bvMatch = regBV.exec(realUrl)
            if(bvMatch){
                bvid = bvMatch[0]
            } else {
                const newE = Object.assign({}, e)
                newE.msg = realUrl
                // 番剧解析单独执行，避免其异常被误判为短链接跳转失败
                return await this.jxfj(newE)
            }
        }

        if(e.msg.match(regBV)){
            bvid = regBV.exec(e.msg)[0]
        }
        let res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,{
            headers: {
                'referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            }
        })
        res = await res.json()
        if(res.code != 0){
            //return e.reply(bvid + "解析失败\n信息:" + res.message)
            return true
        }else{
            e.reply([segment.image(res.data.pic),`${res.data.title}\nhttps://www.bilibili.com/video/${bvid}\n作者: ${res.data.owner.name}\n播放: ${formatNumber(res.data.stat.view)} | 弹幕: ${formatNumber(res.data.stat.danmaku)}\n点赞: ${formatNumber(res.data.stat.like)} | 评论: ${formatNumber(res.data.stat.reply)}\n投币: ${formatNumber(res.data.stat.coin)} | 分享: ${formatNumber(res.data.stat.share)}\n收藏: ${formatNumber(res.data.stat.favorite)} | 时长: ${formatDurationDesc(res.data.duration)}\n\n简介: ${res.data.desc}`],true)
        }
        res = await fetch(`https://api.bilibili.com/x/player/playurl?avid=${res.data.aid}&cid=${res.data.cid}&qn=16&type=mp4&platform=html5`,{
            headers: {
                'referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            }
        })
        res = await res.json()
        if(!res || res.code != 0){
            //e.reply("视频解析失败")
            return true
        }
        e.reply(segment.video(Buffer.from(await (await fetch(res.data.durl[0].url,{
            headers: {
                'referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            }
        })).arrayBuffer())))
        return true
    }


    async jxfj(e){
        let epid = ""
        let ssid = ""

        if (e.msg.includes("点赞") && e.msg.includes("投币")) {
            return true
        }

        const epMatch = regEP.exec(e.msg)

        if (!epMatch) {
            const mdMatch = regMD.exec(e.msg)

            if (mdMatch) {
                try {
                    const temp = await (await fetch(
                        `https://api.bilibili.com/pgc/review/user?media_id=${mdMatch[0].replace("md", "")}`,
                        {
                            headers: {
                                'referer': 'https://www.bilibili.com/',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
                            }
                        }
                    )).json()

                    if (temp?.code !== 0 || !temp?.result?.media?.season_id) {
                        e.reply("番剧解析失败：未获取到番剧信息")
                        return true
                    }

                    ssid = temp.result.media.season_id
                } catch (err) {
                    console.error("B站番剧信息获取失败:", err)
                    e.reply("番剧信息获取失败，请稍后重试")
                    return true
                }
            } else {
                const ssMatch = regSS.exec(e.msg)

                if (!ssMatch) {
                    e.reply("无法识别番剧链接")
                    return true
                }

                ssid = ssMatch[0].replace("ss", "")
            }

            try {
                const temp = await (await fetch(
                    `https://api.bilibili.com/pgc/web/season/section?season_id=${ssid}`,
                    {
                        headers: {
                            'referer': 'https://www.bilibili.com/',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
                        }
                    }
                )).json()

                if (temp?.code !== 0) {
                    e.reply("番剧剧集信息获取失败")
                    return true
                }

                const shareUrl = temp?.result?.main_section?.episodes?.[0]?.share_url
                const episodeMatch = shareUrl?.match(/ep(\d+)/)

                if (!episodeMatch) {
                    e.reply("未找到该番剧的剧集信息")
                    return true
                }

                epid = episodeMatch[1]
            } catch (err) {
                console.error("B站番剧剧集解析失败:", err)
                e.reply("番剧剧集信息获取失败，请稍后重试")
                return true
            }
        } else {
            epid = epMatch[0].replace("ep", "")
        }

        try {
            const res = await (await fetch(
                `https://api.bilibili.com/pgc/view/web/season?ep_id=${epid}`,
                {
                    headers: {
                        'referer': 'https://www.bilibili.com/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
                    }
                }
            )).json()

            if (res?.code !== 0 || !res?.result) {
                e.reply("番剧解析失败：" + displayValue(res?.message, "接口未返回有效数据"))
                return true
            }

            const data = res.result
            const stat = data.stat || {}

            // 评分可能不存在，单独处理，避免访问 undefined.score
            const rating = data.rating?.score !== undefined &&
                           data.rating?.score !== null &&
                           data.rating?.score !== ""
                ? `${data.rating.score} / ${formatNumber(data.rating.count)}`
                : "暂无评分"

            const newEpDesc = displayValue(data.new_ep?.desc, "暂无更新信息")
            const indexShow = displayValue(data.seasons?.[0]?.new_ep?.index_show)

            const title = displayValue(data.title, "暂无标题")
            const link = displayValue(data.link, "暂无链接")

            const views = formatNumber(stat.views)
            const danmakus = formatNumber(stat.danmakus)
            const likes = formatNumber(stat.likes)
            const coins = formatNumber(stat.coins)
            const favorites = formatNumber(stat.favorites)
            const favorite = formatNumber(stat.favorite)

            const msg = []

            // 没有封面时跳过图片，仍然发送文字信息
            if (data.cover) {
                msg.push(segment.image(data.cover))
            }

            msg.push(
                `${title}\n评分: ${rating}\n${newEpDesc}, ${indexShow}\n`,
                "---\n",
                `${link}\n播放: ${views} | 弹幕: ${danmakus}\n点赞: ${likes} | 投币: ${coins}\n追番: ${favorites} | 收藏: ${favorite}\n`
            )

            e.reply(msg, true)
            return true
        } catch (err) {
            console.error("B站番剧解析失败:", err)
            e.reply("番剧信息获取失败，请稍后重试")
            return true
        }
    }
}
