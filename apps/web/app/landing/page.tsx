"use client";

import { useRouter } from "next/navigation";
import { HeroWave } from "@/components/ui/ai-input-hero";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  Check,
  X,
  Github,
  Twitter,
  MessageCircle,
  Folder,
  FileText,
  FileCode,
  Mail,
  MapPin,
  Plus,
} from "lucide-react";
import { TextHoverEffect, FooterBackgroundGradient } from "@/components/ui/hover-footer";
import Image from "next/image";

/* ───────────── Features Data ───────────── */
const features = [
  {
    num: "01",
    title: "多模型智能路由",
    desc: "每个任务分配最优 AI 模型。GPT-5.3 搭建骨架，Kimi K2.5 快速迭代，DeepSeek 深度推理。",
  },
  {
    num: "02",
    title: "规划模式",
    desc: "AI 在编写代码前先提出澄清问题。结构化方案确保输出精准匹配你的意图。",
  },
  {
    num: "03",
    title: "Web IDE",
    desc: "Monaco 编辑器、文件树、HMR 实时预览、版本历史。浏览器中的完整开发环境。",
  },
  {
    num: "04",
    title: "一键部署",
    desc: "即时部署到 Vercel 或导出 ZIP。标准 Next.js 项目 — 无专有运行时，零锁定。",
  },
];

/* ───────────── Comparison Data ───────────── */
type CellValue = "check" | "x" | string;
const comparisonRows: { feature: string; aspark: CellValue; v0: CellValue; bolt: CellValue; base44: CellValue }[] = [
  { feature: "开源", aspark: "check", v0: "x", bolt: "部分", base44: "x" },
  { feature: "多模型 AI", aspark: "check", v0: "x", bolt: "x", base44: "x" },
  { feature: "规划模式", aspark: "check", v0: "x", bolt: "x", base44: "x" },
  { feature: "零厂商锁定", aspark: "check", v0: "部分", bolt: "部分", base44: "x" },
  { feature: "实时预览 + HMR", aspark: "check", v0: "x", bolt: "check", base44: "check" },
  { feature: "自动修复错误", aspark: "check", v0: "x", bolt: "check", base44: "check" },
  { feature: "Web IDE", aspark: "check", v0: "x", bolt: "check", base44: "check" },
  { feature: "一键部署", aspark: "check", v0: "x", bolt: "check", base44: "check" },
];

function CellIcon({ value }: { value: CellValue }) {
  if (value === "check") return <Check className="w-5 h-5 text-emerald-400 mx-auto" />;
  if (value === "x") return <X className="w-5 h-5 text-gray-600 mx-auto" />;
  return <span className="text-sm text-gray-500 block text-center">{value}</span>;
}

/* ───────────── IDE Mockup File Tree ───────────── */
const fileTree = [
  { name: "src", icon: Folder, color: "text-brand", indent: 0 },
  { name: "components", icon: Folder, color: "text-gray-500", indent: 1 },
  { name: "Dashboard.tsx", icon: FileText, color: "text-blue-400", indent: 2, active: true },
  { name: "Header.tsx", icon: FileText, color: "text-blue-400", indent: 2 },
  { name: "Sidebar.tsx", icon: FileText, color: "text-blue-400", indent: 2 },
  { name: "pages", icon: Folder, color: "text-gray-500", indent: 1 },
  { name: "package.json", icon: FileCode, color: "text-emerald-400", indent: 0 },
];

const codeLines = [
  { num: 1, code: "import { Card } from '@/components/ui/card'", color: "text-gray-300" },
  { num: 2, code: "import { BarChart } from '@/components/charts'", color: "text-gray-300" },
  { num: 3, code: "", color: "text-gray-300" },
  { num: 4, code: "export default function Dashboard() {", color: "text-purple-300" },
  { num: 5, code: "  return (", color: "text-gray-300" },
  { num: 6, code: '    <div className="grid gap-4 p-6">', color: "text-sky-300" },
  { num: 7, code: '      <Card title="Revenue" value="$12,400" />', color: "text-green-300" },
  { num: 8, code: '      <Card title="Users" value="1,240" />', color: "text-green-300" },
  { num: 9, code: "      <BarChart data={monthlyData} />", color: "text-sky-300" },
  { num: 10, code: "    </div>", color: "text-sky-300" },
  { num: 11, code: "  )", color: "text-gray-300" },
  { num: 12, code: "}", color: "text-purple-300" },
];

/* ───────────── FAQ Data ───────────── */
const faqItems = [
  {
    id: "01",
    title: "什么是 ASpark？",
    content:
      "ASpark 是一个开源的 AI 驱动全栈应用生成平台。你只需用自然语言描述想法，ASpark 就能自动生成可运行的 Web 应用，包括前端界面、后端逻辑和数据库结构。",
  },
  {
    id: "02",
    title: "使用 ASpark 需要编程经验吗？",
    content:
      "不需要。ASpark 专为零编程基础的用户设计，你只需要描述你想要的应用功能，AI 会自动生成所有代码。当然，如果你有编程经验，也可以在 Web IDE 中直接编辑和调整生成的代码。",
  },
  {
    id: "03",
    title: "我可以用 ASpark 构建哪些类型的应用？",
    content:
      "你可以构建各种类型的 Web 应用，包括但不限于：数据仪表盘、电商平台、CRM 系统、项目管理工具、博客平台、聊天应用、数据分析工具等。只要是基于 Web 的应用，ASpark 都可以帮你生成。",
  },
  {
    id: "04",
    title: "ASpark 支持哪些类型的集成？",
    content:
      "ASpark 生成标准的 Next.js 项目，支持与任何 npm 生态系统中的库和服务集成。你可以轻松对接第三方 API、数据库、身份验证服务、支付网关等。",
  },
  {
    id: "05",
    title: "ASpark 应用是如何部署的？",
    content:
      "ASpark 支持一键部署到 Vercel，也可以导出为标准的 Next.js 项目 ZIP 包，部署到你选择的任何托管平台。没有专有运行时，零厂商锁定。",
  },
  {
    id: "06",
    title: "自然语言开发过程是如何运作的？",
    content:
      "ASpark 使用多模型 AI 智能路由技术：不同的 AI 模型负责不同的任务。系统会先理解你的需求，通过规划模式提出澄清问题，然后生成结构化的代码方案，最后在实时预览中展示结果。",
  },
  {
    id: "07",
    title: "我的数据在 ASpark 上安全吗？",
    content:
      "ASpark 是完全开源的，你可以审查每一行代码。你也可以在自己的基础设施上私有化部署，数据完全由你掌控，不会经过任何第三方服务器。",
  },
  {
    id: "08",
    title: "我是否拥有用 ASpark 创建的应用程序？",
    content:
      "是的，你完全拥有使用 ASpark 生成的所有代码和应用。生成的项目是标准的开源技术栈，没有任何专有依赖或使用限制，你可以自由修改、分发和商业化使用。",
  },
];

/* ═══════════════════════════════════════ */
export default function LandingPage() {
  const router = useRouter();

  const handlePromptSubmit = async (prompt: string) => {
    if (!prompt.trim()) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prompt.trim().slice(0, 50),
          description: prompt.trim(),
        }),
      });
      if (res.ok) {
        const project = await res.json();
        router.push(`/${project.id}?prompt=${encodeURIComponent(prompt.trim())}&skipPlan=true`);
      }
    } catch (e) {
      console.error("Failed to create project:", e);
    }
  };

  return (
    <div className="bg-black text-white">
      {/* ═══ HERO with Wave Animation ═══ */}
      <HeroWave onPromptSubmit={handlePromptSubmit} />

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="bg-[#FAFAFA] py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold tracking-[0.2em] text-brand mb-3 font-mono">
              核心特性
            </p>
            <h2 className="text-3xl lg:text-[40px] font-bold text-gray-900 tracking-tight">
              快速交付所需的一切
            </h2>
            <p className="mt-4 text-gray-500 text-base lg:text-lg">
              从想法到生产环境，只需几分钟而非几周。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div
                key={f.num}
                className="bg-white rounded-2xl border border-gray-200 p-7 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-[10px] bg-[#FFF0EC] flex items-center justify-center mb-4">
                  <span className="text-brand font-bold text-sm font-mono">
                    {f.num}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRODUCT SHOWCASE (IDE Mockup) ═══ */}
      <section id="product" className="bg-white py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold tracking-[0.2em] text-brand mb-3 font-mono">
              产品展示
            </p>
            <h2 className="text-3xl lg:text-[40px] font-bold text-gray-900 tracking-tight">
              完整的开发环境
            </h2>
            <p className="mt-4 text-gray-500 text-base lg:text-lg max-w-xl mx-auto">
              AI 实时生成代码，即时预览应用效果。
            </p>
          </div>

          {/* IDE Mockup */}
          <div className="max-w-[1100px] mx-auto rounded-2xl bg-[#0D1117] border border-[#1F2933] overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 h-10 bg-[#161B22] border-b border-[#1F2933]">
              <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
              <span className="w-3 h-3 rounded-full bg-[#28CA41]" />
              <span className="text-xs text-gray-500 font-mono ml-2">
                ASpark — Web IDE
              </span>
            </div>
            {/* Body */}
            <div className="flex min-h-[400px] lg:min-h-[520px]">
              {/* Sidebar */}
              <div className="w-[200px] lg:w-[220px] border-r border-[#1F2933] p-3 hidden sm:block">
                <p className="text-[11px] font-semibold text-gray-500 tracking-wider mb-3 font-mono">
                  文件浏览器
                </p>
                <div className="space-y-0.5">
                  {fileTree.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-1.5 py-1 px-2 rounded text-xs font-mono ${
                          f.active
                            ? "bg-[#1F2933] text-white"
                            : "text-gray-400"
                        }`}
                        style={{ paddingLeft: `${8 + f.indent * 16}px` }}
                      >
                        <Icon className={`w-3.5 h-3.5 ${f.color}`} />
                        {f.name}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Code editor */}
              <div className="flex-1 p-4 lg:p-5 overflow-x-auto">
                <div className="space-y-0.5">
                  {codeLines.map((line) => (
                    <div key={line.num} className="flex items-center gap-3">
                      <span className="w-6 text-right text-xs text-[#3B4252] font-mono select-none">
                        {line.num}
                      </span>
                      <code
                        className={`text-xs lg:text-sm font-mono ${line.color} whitespace-pre`}
                      >
                        {line.code}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ COMPARISON TABLE ═══ */}
      <section id="compare" className="bg-[#0A0A0A] py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold tracking-[0.2em] text-brand mb-3 font-mono">
              竞品对比
            </p>
            <h2 className="text-3xl lg:text-[40px] font-bold text-white tracking-tight">
              ASpark 的独特优势
            </h2>
            <p className="mt-4 text-gray-400 text-base lg:text-lg">
              开源、多模型 AI、零厂商锁定。
            </p>
          </div>

          <div className="max-w-[1100px] mx-auto rounded-2xl border border-[#1F2933] overflow-hidden bg-[#111111]">
            {/* Header */}
            <div className="grid grid-cols-5 items-center h-14 px-6 bg-[#161B22] text-sm">
              <span className="text-gray-400 font-semibold">功能</span>
              <span className="text-center font-bold text-white flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand" />
                ASpark
              </span>
              <span className="text-center text-gray-500 font-semibold">v0.dev</span>
              <span className="text-center text-gray-500 font-semibold">Bolt.new</span>
              <span className="text-center text-gray-500 font-semibold">Base44</span>
            </div>
            {/* Rows */}
            {comparisonRows.map((row) => (
              <div
                key={row.feature}
                className="grid grid-cols-5 items-center h-12 px-6 border-t border-[#1F2933] text-sm"
              >
                <span className="text-gray-200">{row.feature}</span>
                <CellIcon value={row.aspark} />
                <CellIcon value={row.v0} />
                <CellIcon value={row.bolt} />
                <CellIcon value={row.base44} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="bg-white py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
            {/* Left: Title */}
            <div className="lg:w-[340px] shrink-0">
              <h2 className="text-3xl lg:text-[40px] font-extrabold text-gray-900 tracking-tight leading-tight">
                常见问题解答
              </h2>
            </div>
            {/* Right: Accordion */}
            <div className="flex-1">
              <Accordion type="single" defaultValue="01" collapsible className="w-full">
                {faqItems.map((item) => (
                  <AccordionItem value={item.id} key={item.id} className="border-gray-200">
                    <AccordionTrigger className="text-left hover:pl-3 hover:[&_div.icon-box]:bg-secondary duration-1000 hover:no-underline cursor-pointer [&>svg]:hidden hover:[&_svg]:rotate-90 hover:[&_svg]:text-brand py-6">
                      <div className="flex flex-1 items-start justify-between gap-4">
                        <div className="flex gap-3 items-center">
                          <span className="text-sm text-gray-400 font-mono">{item.id}</span>
                          <h3 className="text-lg md:text-xl font-semibold text-gray-900">{item.title}</h3>
                        </div>
                        <div className="icon-box bg-primary duration-500 rounded-sm flex items-center p-2">
                          <Plus
                            className={cn(
                              "text-primary-foreground size-4 shrink-0 transition-transform duration-1000"
                            )}
                          />
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-6 pr-20 leading-relaxed">
                      {item.content}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <div className="bg-black px-6 lg:px-10 pb-10 pt-4">
        {/* Gradient glow wrapper */}
        <div className="relative rounded-[28px] p-[2px]" style={{
          background: "linear-gradient(135deg, #E04E2A 0%, #FF6B4A 25%, #E04E2A 50%, #C4421F 75%, #FF6B4A 100%)",
        }}>
          {/* Soft outer glow */}
          <div className="absolute -inset-3 rounded-[36px] opacity-30 blur-xl pointer-events-none" style={{
            background: "linear-gradient(135deg, #E04E2A 0%, #FF6B4A 40%, #E04E2A 70%, #C4421F 100%)",
          }} />

          <footer className="relative bg-[#111113] rounded-[26px] overflow-hidden">
            <div className="max-w-7xl mx-auto p-14 z-40 relative">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8 lg:gap-16 pb-12">
                {/* Brand section */}
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center space-x-2">
                    <Image
                      src="/aspark-logo-horizontal.svg"
                      alt="ASpark"
                      width={130}
                      height={28}
                      className="h-7 w-auto"
                    />
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    一个开源 AI 平台，通过自然语言生成全栈 Web 应用。
                  </p>
                </div>

                {/* Product links */}
                <div>
                  <h4 className="text-white text-lg font-semibold mb-6">产品</h4>
                  <ul className="space-y-3">
                    {[
                      { label: "核心特性", href: "#features" },
                      { label: "模板市场", href: "#" },
                      { label: "定价", href: "#" },
                      { label: "更新日志", href: "#" },
                    ].map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className="text-gray-400 hover:text-brand transition-colors"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Developer links */}
                <div>
                  <h4 className="text-white text-lg font-semibold mb-6">开发者</h4>
                  <ul className="space-y-3">
                    {[
                      { label: "技术文档", href: "#" },
                      { label: "API 参考", href: "#" },
                      { label: "GitHub", href: "#" },
                      { label: "参与贡献", href: "#", pulse: true },
                    ].map((link) => (
                      <li key={link.label} className="relative">
                        <a
                          href={link.href}
                          className="text-gray-400 hover:text-brand transition-colors"
                        >
                          {link.label}
                        </a>
                        {"pulse" in link && link.pulse && (
                          <span className="absolute top-0 right-[-10px] w-2 h-2 rounded-full bg-brand animate-pulse" />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Contact section */}
                <div>
                  <h4 className="text-white text-lg font-semibold mb-6">联系我们</h4>
                  <ul className="space-y-4">
                    <li className="flex items-center space-x-3">
                      <Mail size={18} className="text-brand" />
                      <a href="mailto:contact@aspark.dev" className="text-gray-400 hover:text-brand transition-colors">
                        contact@aspark.dev
                      </a>
                    </li>
                    <li className="flex items-center space-x-3">
                      <Github size={18} className="text-brand" />
                      <a href="#" className="text-gray-400 hover:text-brand transition-colors">
                        GitHub Discussions
                      </a>
                    </li>
                    <li className="flex items-center space-x-3">
                      <MapPin size={18} className="text-brand" />
                      <span className="text-gray-400">Open Source, Worldwide</span>
                    </li>
                  </ul>
                </div>
              </div>

              <hr className="border-t border-gray-700/50 my-8" />

              {/* Footer bottom */}
              <div className="flex flex-col md:flex-row justify-between items-center text-sm space-y-4 md:space-y-0">
                {/* Social icons */}
                <div className="flex space-x-6 text-gray-400">
                  {[
                    { icon: <Github size={20} />, label: "GitHub", href: "#" },
                    { icon: <Twitter size={20} />, label: "Twitter", href: "#" },
                    { icon: <MessageCircle size={20} />, label: "Discord", href: "#" },
                  ].map(({ icon, label, href }) => (
                    <a
                      key={label}
                      href={href}
                      aria-label={label}
                      className="hover:text-brand transition-colors"
                    >
                      {icon}
                    </a>
                  ))}
                </div>

                {/* Copyright */}
                <p className="text-center md:text-left text-gray-500">
                  &copy; {new Date().getFullYear()} ASpark. 以 AI 之力，为构建者而生。
                </p>
              </div>
            </div>

            {/* Text hover effect */}
            <div className="lg:flex hidden h-[30rem] -mt-52 -mb-36">
              <TextHoverEffect text="ASpark" className="z-50" />
            </div>

            <FooterBackgroundGradient />
          </footer>
        </div>
      </div>
    </div>
  );
}
