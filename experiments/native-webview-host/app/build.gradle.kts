plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace="com.rotinafamily.nativehosttest"; compileSdk=35
 defaultConfig { applicationId="com.rotinafamily.nativehosttest"; minSdk=26; targetSdk=35; versionCode=1; versionName="0.1-webview-host-test" }
 compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget="17" }
}
