package com.snowbreak.rivals.official;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 沉浸式全屏：内容延伸到状态栏/导航栏区域，多让出来的高度直接变成可见画面。
        // BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE：用户从边缘上滑仍可临时唤出系统栏。
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applyImmersive();
    }

    /**
     * [沉浸式修复] 系统栏会自己"回来"，所以每次窗口重新获得焦点都要再藏一次。
     *
     * 原来只在 onCreate 里 hide 一次 ⇒ 顶部状态栏打开游戏后常驻不消失。两个原因叠加：
     *   ① onCreate 时 decorView 可能尚未附着/获得焦点，那一次 hide 会被系统忽略；
     *   ② Android 会在窗口重新获得焦点时把系统栏恢复回来（切后台再切回、弹窗关闭、
     *      软键盘收起、用户从边缘上滑临时唤出系统栏之后…），而 hide 设置不会自动重放。
     * 因此这里与 onResume 都补一次 —— hide 是幂等的，重复调用无副作用。
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImmersive();
    }

    /** 把状态栏 + 导航栏两条系统栏一起藏起来（幂等，可重复调用） */
    private void applyImmersive() {
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            // [图标颜色] 由主题负责：styles.xml 里两个主题都设了
            //     android:windowLightStatusBar=false / windowLightNavigationBar=false
            //   ⇒ 系统栏使用【浅色（白）图标】。
            // 本项目 targetSdk=36，Android 15 起 edge-to-edge 强制、系统栏背景恒定透明；
            // 若仍是深色图标，压在深色游戏画面上几乎看不见。平时栏被藏起来看不到，
            // 只有用户从边缘滑出时才会露出，所以在那之前必须设对。
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }
}
