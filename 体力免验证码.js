import fetch from 'node-fetch'
import md5 from 'md5'
import moment from "moment"
import lodash from 'lodash'
import fs from "fs"
import YAML from 'yaml'
import puppeteer from '../../lib/puppeteer/puppeteer.js'

/*
* 体力免验证码
* 从米游社小组件api获取体力详情，需要安装cvs插件并绑定stoken，支持原神和星穹铁道
*/

/*
* 与实时便笺api区别
* 原神：无派遣探索剩余时间、洞天宝钱回复时间、周本和质变仪信息；增加了每日签到状态
* 星穹铁道：展示开拓力、每日实训活跃度、模拟宇宙每周积分和每日签到状态
*/


const mysSalt = "fdv0fY9My9eA7MR0NpjGP9RjueFvjUSQ" //k2
const mysSalt2 = "t0qEgfub6cvueAPgR5m9aQWWVciEer7v" //x6
// 每个米游社账号单独复用设备身份，避免所有用户共用同一个进程级 Device ID。
const DEVICE_CACHE = new Map()
const DEVICE_NAME = 'Xiaomi 14'
const DEVICE_MODEL = 'Mi 10'
const DEFAULT_DEVICE_FP = '38d805c20d53d'

export class dailyNoteByWidget extends plugin {
    constructor(e) {
        super({
            name: '体力免验证码',
            dsc: '原神|星铁体力免验证码',
            event: 'message',
            priority: -100,
            rule: [
                {
                    reg: '^#*(原神|星铁)?(体力|树脂|查询体力)$',
                    fnc: 'note',
                }
            ]
        })

        this._path = process.cwd().replace(/\\/g, '/')
        this.gsUrl = 'https://api-takumi-record.mihoyo.com/game_record/genshin/aapi/widget/v2'
        this.srUrl = 'https://api-takumi-record.mihoyo.com/game_record/app/hkrpg/aapi/widget'
    }

    async note(e) {
        let uid = e.user.getUid(e.isSr ? 'sr' : 'gs')
        if (!uid) {
            e.reply(`未绑定${e.isSr ? '星穹铁道' : '原神'}uid`)
            return false
        }
        let sk = this.getStoken(e.user_id, uid)
        if (lodash.isEmpty(sk)) {
            e.reply(`未找到${e.isSr ? '星穹铁道' : '原神'}uid:${uid}绑定的stoken，请先【#扫码登陆】绑定stoken或【#uid+序号】切换uid`)
            return false
        }
        e.uid = uid
        e.cookie = `stuid=${sk.stuid};stoken=${sk.stoken};mid=${sk.mid};`
        this.deviceInfo = await this.getDeviceIdentity(sk)
        let headers = this.getHeaders(e.isSr)
        let res = await fetch(e.isSr ? this.srUrl : this.gsUrl, { method: "get", headers }).then(res => res.json())
        if (!res || res.retcode !== 0) return false

        let data = await this.getData(res)
        if (!data) return false

        let img = await puppeteer.screenshot(`dailyNoteByWidget${e.isSr ? '_SR' : ''}`, data)
        if (img) await this.reply(img)
    }

    async getData(res) {
        let gameData = {}
        if (this.e.isSr) {
            // 使用 Genshin MysApi 的 UserGame（Cookie）流程获取昵称、等级和真实区服。
            // getUserGameRolesByStoken 在当前接口环境下不稳定，且此前使用的 DS2 也不适用于该绑定接口。
            const srContext = await this.getSrAccountContext()
            gameData = srContext?.role || {}

        }

        let data = this.e.isSr ? this.noteSr(res) : this.noteData(res)
        let screenData = {
            tplFile: `./resources/html/dailyNoteByWidget${this.e.isSr ? '_SR' : ''}/dailyNoteByWidget.html`,
            pluResPath: `${this._path}/resources/`,
        }
        return {
            name: this.e.sender.card,
            quality: 100,
            ...screenData,
            ...data,
            ...gameData
        }
    }

    noteData(res) {
        let { data } = res

        let nowDay = moment().date()
        let nowUnix = Number(moment().format("X"))

        /** 树脂 */
        let resinMaxTime
        if (data.resin_recovery_time > 0) {
            resinMaxTime = nowUnix + Number(data.resin_recovery_time)

            let maxDate = moment.unix(resinMaxTime)
            resinMaxTime = maxDate.format("HH:mm")

            if (maxDate.date() != nowDay) {
                resinMaxTime = `明天 ${resinMaxTime}`
            } else {
                resinMaxTime = ` ${resinMaxTime}`
            }
        }

        /** 洞天宝钱无回复时间，按30/h进行估算 */
        let coinTime = ''
        if (!data.home_coin_recovery_time && data.current_home_coin < data.max_home_coin) {
            data.home_coin_recovery_time = (data.max_home_coin - data.current_home_coin) / 30 * 3600
        }
        if (data.home_coin_recovery_time > 0) {
            let coinDay = Math.floor(data.home_coin_recovery_time / 3600 / 24)
            let coinHour = Math.floor((data.home_coin_recovery_time / 3600) % 24)
            let coinMin = Math.floor((data.home_coin_recovery_time / 60) % 60)
            if (coinDay > 0) {
                coinTime = `${coinDay}天${coinHour}小时${coinMin}分钟`
            } else {
                let coinDate = moment.unix(
                    nowUnix + Number(data.home_coin_recovery_time)
                )

                if (coinDate.date() != nowDay) {
                    coinTime = `明天 ${coinDate.format('HH:mm')}`
                } else {
                    coinTime = coinDate.format('HH:mm')
                }
            }
        }

        let week = [
            "星期日",
            "星期一",
            "星期二",
            "星期三",
            "星期四",
            "星期五",
            "星期六",
        ]
        let day = `${moment().format("MM-DD HH:mm")} ${week[moment().day()]}`

        return {
            uid: this.e.uid,
            saveId: this.e.uid,
            resinMaxTime,
            coinTime,
            day,
            ...data,
        }
    }

    noteSr(res) {
        let { data } = res
        let nowDay = moment().date()

        /** 树脂 */
        let resinMaxTime
        if (data.stamina_recover_time > 0) {
            let d = moment.duration(data.stamina_recover_time, 'seconds')
            let day = Math.floor(d.asDays())
            let hours = d.hours()
            let minutes = d.minutes()
            let seconds = d.seconds()
            resinMaxTime = hours + '小时' + minutes + '分钟' + seconds + '秒'
            //精确到秒。。。。
            if (day > 0) {
                resinMaxTime = day + '天' + hours + '小时' + minutes + '分钟' + seconds + '秒'
            } else if (hours > 0) {
                resinMaxTime = hours + '小时' + minutes + '分钟' + seconds + '秒'
            } else if (minutes > 0) {
                resinMaxTime = minutes + '分钟' + seconds + '秒'
            } else if (seconds > 0) {
                resinMaxTime = seconds + '秒'
            }
            if ((day > 0) || (hours > 0) || (seconds > 0)) {
                let total_seconds = 3600 * hours + 60 * minutes + seconds
                const now = new Date()
                const dateTimes = now.getTime() + total_seconds * 1000
                const date = new Date(dateTimes)
                const dayDiff = date.getDate() - now.getDate()
                const str = dayDiff === 0 ? '' : '明天'
                const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date
                    .getMinutes()
                    .toString()
                    .padStart(2, '0')}`
                let recoverTimeStr = ` | ${str}${timeStr}`
                resinMaxTime += recoverTimeStr
            }
        }
        data.bfStamina = data.current_stamina / data.max_stamina * 100 + '%'

        // 标识属性图标~
        let icon = lodash.sample(['希儿', '白露', '艾丝妲', '布洛妮娅', '姬子', '卡芙卡', '克拉拉', '停云', '佩拉', '黑塔', '希露瓦', '银狼'])
        let week = [
            '星期日',
            '星期一',
            '星期二',
            '星期三',
            '星期四',
            '星期五',
            '星期六'
        ]

        let day = `${week[moment().day()]}`

        return {
            uid: this.e.uid,
            saveId: this.e.uid, icon, day,
            resinMaxTime, nowDay: moment(new Date()).format('YYYY年MM月DD日'),
            ...data
        }
    }

    // 赋值兼容图鉴模板
    dealData(res) {
        res.data.home_coin_recovery_time = (res.data.max_home_coin - res.data.current_home_coin) / 30 * 3600
        res.data.remain_resin_discount_num = 3
        res.data.resin_discount_num_limit = 3
        res.data.transformer = { obtained: false }

        return res
    }

    async getSrAccountContext() {
        try {
            const sk = this.getStoken(this.e.user_id, this.e.uid)
            const stuid = String(sk?.stuid || sk?.uid || '')
            const stoken = String(sk?.stoken || '')
            const mid = String(sk?.mid || '')
            if (!stuid || !stoken || !mid) {
                globalThis.logger?.debug?.(`[体力免验证码] 星铁账号凭据不完整：stuid=${Boolean(stuid)} stoken=${Boolean(stoken)} mid=${Boolean(mid)}`)
                return { role: {}, api: null }
            }

            const gameBiz = /^[125]/.test(String(this.e.uid)) ? 'hkrpg_cn' : 'hkrpg_global'
            const { default: GenshinMysApi } = await import(`file://${this._path}/plugins/genshin/model/mys/mysApi.js`)
            const stokenCookie = `stuid=${stuid};stoken=${stoken};mid=${mid};`
            const api = new GenshinMysApi(
                this.e.uid,
                stokenCookie,
                { game: 'sr', device: this.deviceInfo?.deviceId, log: false },
                '',
                gameBiz
            )

            // 与 Genshin MysApi 的 refreshCk 保持一致：从 Stoken 交换 Ltoken(type=2) 与 Cookie Token(type=4)。
            const [ltokenResult, cookieResult] = await Promise.all([
                api.getData('exchange', { token: stoken, type: 2, mid, deviceId: this.deviceInfo?.deviceId, deviceFp: this.deviceInfo?.deviceFp }),
                api.getData('exchange', { token: stoken, type: 4, mid, deviceId: this.deviceInfo?.deviceId, deviceFp: this.deviceInfo?.deviceFp })
            ])
            const ltoken = String(ltokenResult?.data?.token?.token || sk?.ltoken || '').trim()
            const cookieToken = String(cookieResult?.data?.token?.token || cookieResult?.data?.cookie_token || '').trim()
            if (!cookieToken || !ltoken) {
                globalThis.logger?.debug?.(`[体力免验证码] 星铁 Stoken exchange 未取得完整 Ltoken/Cookie Token：Ltoken=${Boolean(ltoken)} CookieToken=${Boolean(cookieToken)}；${cookieResult?.message || cookieResult?.retcode || ''}`)
                return { role: {}, api: null }
            }

            const ck = `ltoken=${ltoken};ltuid=${stuid};cookie_token=${cookieToken};account_id=${stuid};`
            api.cookie = ck
            this.srMysApi = api

            const roleResult = await api.getData('UserGame', {
                game_biz: gameBiz,
                deviceId: this.deviceInfo?.deviceId,
                deviceFp: this.deviceInfo?.deviceFp,
                headers: {
                    'x-rpc-device_id': this.deviceInfo?.deviceId,
                    'x-rpc-device_fp': this.deviceInfo?.deviceFp
                }
            })
            if (Number(roleResult?.retcode) !== 0) {
                globalThis.logger?.debug?.(`[体力免验证码] 获取星铁角色信息失败：${roleResult?.retcode} ${roleResult?.message || ''}`)
                return { role: {}, api }
            }

            const roles = Array.isArray(roleResult?.data?.list) ? roleResult.data.list : []
            const role = roles.find(item => String(item?.game_uid) === String(this.e.uid))
            if (!role) {
                globalThis.logger?.debug?.(`[体力免验证码] 角色列表中未找到星铁 UID ${this.e.uid}，返回角色数：${roles.length}`)
                return { role: {}, api }
            }

            return {
                api,
                role: {
                    ...role,
                    nickname: role.nickname || role.game_role_name || role.name || '',
                    level: role.level ?? role.game_level ?? role.player_level ?? ''
                }
            }
        } catch (error) {
            globalThis.logger?.debug?.(`[体力免验证码] 获取星铁账号信息异常：${error.message}`)
            return { role: {}, api: null }
        }
    }

    async getDeviceIdentity(sk = {}) {
        const stuid = String(sk.stuid || sk.uid || '')
        const cacheKey = stuid || String(this.e.user_id || 'default')
        if (DEVICE_CACHE.has(cacheKey)) return DEVICE_CACHE.get(cacheKey)

        let deviceId = this.e.deviceId || sk.deviceId || sk.device_id || ''
        let deviceFp = this.e.deviceFp || sk.deviceFp || sk.device_fp || ''

        // 优先复用 Genshin MysUsers 中已持久化的账号设备 ID。
        if (!deviceId && stuid) {
            try {
                const { default: MysUser } = await import(`file://${this._path}/plugins/genshin/model/mys/MysUser.js`)
                const mysUser = await MysUser.create(stuid)
                if (mysUser?.device) deviceId = mysUser.device
                if (!deviceId && mysUser?.db) {
                    deviceId = randomString(32).toUpperCase()
                    mysUser.setCkData({ device: deviceId })
                    await mysUser.save()
                }
            } catch (error) {
                globalThis.logger?.debug?.(`[体力免验证码] 读取/保存账号设备 ID 失败：${error.message}`)
            }
        }

        if (!deviceId) deviceId = randomString(32).toUpperCase()

        // FP 优先读取小遥/Genshin 已缓存的账号级指纹，保持与 Device ID 的账号归属一致。
        if (!deviceFp && stuid) {
            try {
                const redisClient = globalThis.redis
                deviceFp = await redisClient?.get?.(`genshin:device_fp:${stuid}:fp`)
                    || await redisClient?.get?.(`ZZZ:DEVICE_FP:${stuid}:FP`)
                    || ''
            } catch {}
        }
        deviceFp = deviceFp || DEFAULT_DEVICE_FP

        const identity = { deviceId, deviceFp }
        DEVICE_CACHE.set(cacheKey, identity)
        return identity
    }

    getStoken(userId, uid) {
        let file = `${this._path}/plugins/xiaoyao-cvs-plugin/data/yaml/${userId}.yaml`
        if (fs.existsSync(file)) {
            let ck = fs.readFileSync(file, 'utf-8')
            ck = YAML.parse(ck)
            if (ck[uid]) {
                return ck[uid]
            }
        }
        return {}
    }

    getDs(salt = mysSalt) {
        const randomStr = randomString(6)
        const timestamp = Math.floor(Date.now() / 1000)
        let sign = md5(`salt=${salt}&t=${timestamp}&r=${randomStr}`)
        return `${timestamp},${randomStr},${sign}`
    }

    getDs2(q = "", b = "", salt = mysSalt2) {
        let t = Math.round(new Date().getTime() / 1000)
        let r = Math.floor(Math.random() * 900000 + 100000)
        let DS = md5(`salt=${salt}&t=${t}&r=${r}&b=${b}&q=${q}`)
        return `${t},${r},${DS}`
    }

    getHeaders(isSr = false, query = '', body = '') {
        const identity = this.deviceInfo || {}
        const headers = {
            'Cookie': this.e.cookie,
            "x-rpc-channel": "miyousheluodi",
            'x-rpc-device_id': identity.deviceId || randomString(32).toUpperCase(),
            'x-rpc-app_version': '2.40.1',
            "x-rpc-device_model": DEVICE_MODEL,
            'x-rpc-device_name': DEVICE_NAME,
            'x-rpc-client_type': '2',
            "DS": isSr ? this.getDs2(query, body) : this.getDs(),
            "Referer": "https://app.mihoyo.com",
            "x-rpc-sys_version": "12",
            "User-Agent": "okhttp/4.8.0",
        }
        if (identity.deviceFp) headers['x-rpc-device_fp'] = identity.deviceFp
        return headers
    }
}

function randomString(length, os = false) {
    let randomStr = ''
    for (let i = 0; i < length; i++) {
        randomStr += lodash.sample(os ? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' :
            'abcdefghijklmnopqrstuvwxyz0123456789')
    }
    return randomStr
}
