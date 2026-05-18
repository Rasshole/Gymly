#import "AppDelegate.h"

#import <TargetConditionals.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTDevLoadingViewSetEnabled.h>
#import <Firebase.h>
@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
#if DEBUG
  /* Skjul øverste "Bundling …%"-banner (screen recording / content). Sæt til YES hvis du vil se load-progress. */
  RCTDevLoadingViewSetEnabled(NO);
#endif
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }
  self.moduleName = @"GymlyFresh";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
  // Simulator: always load JS from Metro (also when scheme is Release), so UI code changes show up
  // without rebuilding an embedded main.jsbundle.
#if TARGET_OS_SIMULATOR
  NSURL *simURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
  if (!simURL) {
    simURL = [NSURL URLWithString:@"http://127.0.0.1:8081/index.bundle?platform=ios&dev=true"];
  }
  NSLog(@"[Gymly RN] Simulator → Metro (live JS). URL: %@", simURL.absoluteString);
  return simURL;
#elif DEBUG
  NSURL *bundleURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
  if (!bundleURL) {
    bundleURL = [NSURL URLWithString:@"http://127.0.0.1:8081/index.bundle?platform=ios&dev=true"];
  }
  NSLog(@"[Gymly RN] DEBUG device → Metro. URL: %@", bundleURL.absoluteString);
  return bundleURL;
#else
  NSURL *embedded = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
  NSLog(@"[Gymly RN] RELEASE device → embedded bundle. URL: %@", embedded.absoluteString);
  return embedded;
#endif
}

@end
