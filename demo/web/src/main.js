import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { House, FolderOpened, UploadFilled, SetUp, List, MagicStick, EditPen, Cpu, Collection, CircleCheck, Files, Grid, DocumentChecked, Lock, Connection, DataAnalysis, DataLine, Search, Bell, ArrowDown, Expand, Fold, Loading, Plus, ArrowRight, Document, Download, Check, Close, Picture, Upload } from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import './style.css'
import './workspace.css'
import './knowledgeGraph.css'
import './projectConfig.css'
import './preprocessing.css'
import './knowledgeBase.css'
import './annotationReview.css'
import App from './App.vue'

const app = createApp(App)
for (const [name, component] of Object.entries({ House, FolderOpened, UploadFilled, SetUp, List, MagicStick, EditPen, Cpu, Collection, CircleCheck, Files, Grid, DocumentChecked, Lock, Connection, DataAnalysis, DataLine, Search, Bell, ArrowDown, Expand, Fold, Loading, Plus, ArrowRight, Document, Download, Check, Close, Picture, Upload })) app.component(name, component)
app.use(ElementPlus, { locale: zhCn }).mount('#app')
