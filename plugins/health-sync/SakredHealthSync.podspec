require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'SakredHealthSync'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'MIT'
  s.homepage = 'https://sakredbody.com'
  s.author = 'Sakred Body'
  s.source = { :git => 'https://github.com/sakredapp/sakredbody.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/HealthSyncPlugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  # HealthKit's background delivery API needs iOS 13 at minimum; Capacitor 8
  # already floors the app at 14, so this is the app's deployment target and
  # not a constraint of its own.
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.frameworks = 'HealthKit'
  s.swift_version = '5.1'
end
