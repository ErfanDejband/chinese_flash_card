/**
 * Tables for `zhuyin.ts`, generated once from pinyin-pro's dictionary so the converter doesn't load
 * it. `zhuyin.test.ts` compares them with the dictionary. Left out: the interjections m, n, ng and hng.
 */

/** Every Mandarin syllable, toneless. */
export const SYLLABLES: readonly string[] = [
  'a ai an ang ao',
  'ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu',
  'ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua',
  'chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo',
  'da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo',
  'e ei en eng er',
  'fa fan fang fei fen feng fo fou fu',
  'ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo',
  'ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo',
  'ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun',
  'ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo',
  'la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo',
  'lü lüe',
  'ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu',
  'na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nü nüe',
  'o ou',
  'pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu',
  'qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun',
  'ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo',
  'sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai',
  'shuan shuang shui shun shuo si song sou su suan sui sun suo',
  'ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo',
  'wa wai wan wang wei wen weng wo wu',
  'xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun',
  'ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun',
  'za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu',
  'zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo',
  'ê',
].join(' ').split(' ')

/** Characters with a reading that starts with a vowel: 案 àn. These decide fāng+àn from fān+gàn. */
export const VOWEL_START: ReadonlySet<string> = new Set(
  [
    '二仰伌佴侒侕俄俺偔偣偶傲僫僾儑儗儿児兒凒凹刵匎区區卬卾厂厄厈厫叆吖吘吪吽呃呕呝呵咡咢咹哀哎哦唉唲',
    '唵啀啊啞啽喔嗄嗌嗳嗷嗸嘊嘔噁噢噩噯嚄嚣囮坳垇垩垵埃埯堊堓堨堮塧塸墺墽壒奀奡奥奧妸妿姶娥娭娾娿婀婩',
    '媕媪媼嫒嫯嬡安尒尓尔屙屵屽岇岋岙岰岸峉峎峏峖峨峩崿嵦嶅嶴广庵廅廒弍弐怄恩恶悪惡愕愛慠慪懊懓懝戹扷',
    '扼抝拗按挨捱揞搕搤搹摁摮擙擜敋敖敱敳昂昹昻晻暗暧曖杒枊枙柪栭栮案桉梎梕樲櫙櫮欧欬欸歐歞歺殴毆毐毦',
    '氨沤泑洏洝洱涐湂溰溾滶漚澚澳濭焥煾熝熬熰爊爱爾犴獒獓玵珥珴琧瑷璈璦瓯甌痷痾癌皑皒皚皧盎盦盫眑睋瞹',
    '矮砈砐砨砹硆硋硙碍磀磑磝礘礙禺筽粫絠罯翱翶翺而耏耦耳聏聱肮胹胺腌腢腤腭膒艹艾芺苊荋荌莪菴萻萼葊蒽',
    '蓭蔜蔼蕅蕚薁薆薾藕藲藹蚅蛾蝁螯衈袄袻裺襖覨訛誀誐誒誝諤諰諳謳謷謸譌譪譺讍讴讹诶谔谙豟豻貋貮貳賹贰',
    '趰躷軛軪軶輀轜轭迗迩遌遏遨遻邇郩鄂醠鈋鈪鉺銨銰鋨錌錒鍔鎄鏂鏊鏕鏖鑀鑩铒铵锇锕锷锿镺閼闇阏阨阸阿陑',
    '隌隑隘隞隩隭雸霭靄靉鞌鞍鞥韽頋頞頟額顎颚额餌餓餩餲饵饿馣馤駬騀驁骜骯髵髶魤鮞鮟鰐鰪鰲鱫鱷鲕鳄鳌鴎',
    '鴯鴱鵈鵝鵞鵪鶕鶚鷔鷗鸥鸸鹅鹌鹗黯鼇齃齶',
  ].join(''),
)
